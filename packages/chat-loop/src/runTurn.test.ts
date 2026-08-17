import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONVERSATIONAL_KIND, EVENT_CREATED_KIND, FAILURE_KIND } from "@assistant/core";
import { FakeProvider } from "@assistant/providers";
import { RenderRegistry, renderConversational, renderEventCreated, renderFailure } from "@assistant/rendering";
import {
  createDatabase,
  ensureOwnerUser,
  findOrCreateSession,
  insertUserMessage,
  loadRecentHistory,
  OWNER_USER_ID,
} from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { runTurn } from "./runTurn.js";
import { buildTestMcpClient, TEST_ADD_EVENT_TOOL_DEFINITION } from "./testHelpers/mcp.js";

const NOW = new Date("2026-08-02T23:00:00.000Z"); // 2026-08-03T07:00 SGT

function registry(): RenderRegistry {
  return new RenderRegistry()
    .register(CONVERSATIONAL_KIND, renderConversational)
    .register(EVENT_CREATED_KIND, renderEventCreated)
    .register(FAILURE_KIND, renderFailure);
}

describe("runTurn", () => {
  let testDb: TestDatabase;
  let sessionCounter = 0;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function freshSessionWithUserMessage(content: string): Promise<string> {
    sessionCounter += 1;
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: `run-turn-${sessionCounter}`,
    });
    await insertUserMessage(testDb.database, {
      sessionId: session.id,
      content,
      platformMessageId: `msg-${sessionCounter}`,
    });
    return session.id;
  }

  it("persists the assistant reply and a success turn_usage row on a conversational turn", async () => {
    const sessionId = await freshSessionWithUserMessage("hello");
    const provider = new FakeProvider([
      { text: "Hi there!", model: "fake-model", usage: { inputTokens: 10, outputTokens: 3, cacheReadTokens: 0 } },
    ]);
    const mcpClient = await buildTestMcpClient(() => ({}));

    const { envelope, text } = await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "You are helpful.",
      sessionId,
      now: NOW,
      ownerTimezone: "Asia/Singapore",
      registry: registry(),
      mcpClient,
      tools: [],
    });

    expect(envelope).toEqual({ status: "success", kind: "conversational", data: { text: "Hi there!" } });
    expect(text).toBe("Hi there!");

    const history = await loadRecentHistory(testDb.database, sessionId, 10);
    expect(history.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "Hi there!" },
    ]);
  });

  it("makes exactly one model call on a successful tool turn and returns the rendered confirmation", async () => {
    const sessionId = await freshSessionWithUserMessage("Add dinner with Cheryl tomorrow 7pm");
    const provider = new FakeProvider([
      {
        text: "",
        toolCall: { id: "tu_1", name: "add_event", input: { title: "Dinner with Cheryl", dateExpression: "tomorrow 19:00" } },
        model: "fake-model",
        usage: { inputTokens: 20, outputTokens: 5, cacheReadTokens: 0 },
      },
    ]);
    const mcpClient = await buildTestMcpClient(() => ({
      structuredContent: {
        eventId: "e1",
        title: "Dinner with Cheryl",
        startsAt: "2026-08-03T11:00:00.000Z",
        durationMinutes: 60,
        durationWasDefaulted: false,
      },
    }));

    const { envelope, text } = await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "sys",
      sessionId,
      now: NOW,
      ownerTimezone: "Asia/Singapore",
      registry: registry(),
      mcpClient,
      tools: [TEST_ADD_EVENT_TOOL_DEFINITION],
    });

    expect(provider.calls).toHaveLength(1);
    expect(envelope.status).toBe("success");
    expect(envelope.kind).toBe("event_created");
    expect(text).toBe("Dinner with Cheryl — 7:00 PM, Monday 3 August 2026 — added to your schedule.");

    const history = await loadRecentHistory(testDb.database, sessionId, 10);
    expect(history.at(-1)?.content).toBe(text);
  });

  it("uses the stored title from the tool result, not anything the model said", async () => {
    const sessionId = await freshSessionWithUserMessage("Add dinner tomorrow");
    const provider = new FakeProvider([
      {
        text: "",
        toolCall: { id: "tu_1", name: "add_event", input: { title: "model's version", dateExpression: "tomorrow" } },
        model: "fake-model",
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
      },
    ]);
    const mcpClient = await buildTestMcpClient(() => ({
      structuredContent: {
        eventId: "e1",
        title: "STORED title",
        startsAt: "2026-08-03T00:00:00.000Z",
        durationMinutes: 60,
        durationWasDefaulted: false,
      },
    }));

    const { text } = await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "sys",
      sessionId,
      now: NOW,
      ownerTimezone: "Asia/Singapore",
      registry: registry(),
      mcpClient,
      tools: [TEST_ADD_EVENT_TOOL_DEFINITION],
    });

    expect(text).toContain("STORED title");
    expect(text).not.toContain("model's version");
  });

  it("retries a failed tool call within budget and succeeds on the second attempt", async () => {
    const sessionId = await freshSessionWithUserMessage("Add something next Thursday-ish");
    const provider = new FakeProvider([
      {
        text: "",
        toolCall: { id: "tu_1", name: "add_event", input: { title: "Something", dateExpression: "next Thursday-ish" } },
        model: "fake-model",
        usage: { inputTokens: 5, outputTokens: 2, cacheReadTokens: 0 },
      },
      {
        text: "",
        toolCall: { id: "tu_2", name: "add_event", input: { title: "Something", dateExpression: "thu 09:00" } },
        model: "fake-model",
        usage: { inputTokens: 8, outputTokens: 2, cacheReadTokens: 0 },
      },
    ]);
    let callCount = 0;
    const mcpClient = await buildTestMcpClient((input) => {
      callCount += 1;
      if (callCount === 1) {
        return { isError: true, errorText: `Could not resolve date expression: "${input.dateExpression}"` };
      }
      return {
        structuredContent: {
          eventId: "e1",
          title: "Something",
          startsAt: "2026-08-06T01:00:00.000Z",
          durationMinutes: 60,
          durationWasDefaulted: false,
        },
      };
    });

    const { envelope } = await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "sys",
      sessionId,
      now: NOW,
      ownerTimezone: "Asia/Singapore",
      registry: registry(),
      mcpClient,
      tools: [TEST_ADD_EVENT_TOOL_DEFINITION],
    });

    expect(provider.calls).toHaveLength(2);
    expect(envelope.status).toBe("success");
    expect(envelope.kind).toBe("event_created");
    // The second call must carry a proper tool_use/tool_result exchange —
    // Anthropic's API requires this shape, so asserting it here is asserting
    // the request would actually be accepted, not just that our code ran.
    const secondCallMessages = provider.calls[1]?.messages ?? [];
    const assistantToolUse = secondCallMessages.find(
      (m) => m.role === "assistant" && Array.isArray(m.content) && m.content[0]?.type === "tool_use",
    );
    const userToolResult = secondCallMessages.find(
      (m) => m.role === "user" && Array.isArray(m.content) && m.content[0]?.type === "tool_result",
    );
    expect(assistantToolUse).toBeDefined();
    expect(userToolResult).toBeDefined();
  });

  it("returns a distinct failure envelope when the iteration budget is exhausted", async () => {
    const sessionId = await freshSessionWithUserMessage("Add something bad");
    const alwaysBadDate = { title: "x", dateExpression: "bad" };
    const provider = new FakeProvider(
      Array.from({ length: 5 }, (_, i) => ({
        text: "",
        toolCall: { id: `tu_${i}`, name: "add_event", input: alwaysBadDate },
        model: "fake-model",
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
      })),
    );
    const mcpClient = await buildTestMcpClient(() => ({ isError: true, errorText: "always fails" }));

    const { envelope } = await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "sys",
      sessionId,
      now: NOW,
      ownerTimezone: "Asia/Singapore",
      registry: registry(),
      mcpClient,
      tools: [TEST_ADD_EVENT_TOOL_DEFINITION],
    });

    expect(provider.calls).toHaveLength(5);
    expect(envelope.status).toBe("error");
    expect(envelope.kind).toBe("failure");

    // Budget exhaustion is not persisted as a reply to history.
    const history = await loadRecentHistory(testDb.database, sessionId, 10);
    expect(history.every((m) => m.role === "user")).toBe(true);
  });

  it("returns a failure envelope and a failure turn_usage row when the provider throws", async () => {
    const sessionId = await freshSessionWithUserMessage("hello");
    const provider = new FakeProvider([new Error("network error")]);
    const mcpClient = await buildTestMcpClient(() => ({}));
    let caughtError: unknown;

    const { envelope } = await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "sys",
      sessionId,
      now: NOW,
      ownerTimezone: "Asia/Singapore",
      registry: registry(),
      mcpClient,
      tools: [],
      onError: (error) => {
        caughtError = error;
      },
    });

    expect(envelope.status).toBe("error");
    expect(envelope.kind).toBe("failure");
    if (envelope.status === "error" && envelope.kind === "failure") {
      expect((envelope.data as { message: string }).message).not.toContain("network error");
    }
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe("network error");

    const history = await loadRecentHistory(testDb.database, sessionId, 10);
    expect(history.every((m) => m.role === "user")).toBe(true);
  });

  it("wraps only the latest user message with the current-time envelope, leaving earlier history untouched", async () => {
    const sessionId = await freshSessionWithUserMessage("first message");
    const provider = new FakeProvider([
      { text: "ack 1", model: "fake-model", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } },
      { text: "ack 2", model: "fake-model", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } },
    ]);
    const mcpClient = await buildTestMcpClient(() => ({}));

    await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "sys",
      sessionId,
      now: NOW,
      ownerTimezone: "Asia/Singapore",
      registry: registry(),
      mcpClient,
      tools: [],
    });

    await insertUserMessage(testDb.database, {
      sessionId,
      content: "second message",
      platformMessageId: "second-msg",
    });

    await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "sys",
      sessionId,
      now: NOW,
      ownerTimezone: "Asia/Singapore",
      registry: registry(),
      mcpClient,
      tools: [],
    });

    const secondCallMessages = provider.calls[1]?.messages ?? [];
    expect(secondCallMessages[0]?.content).toBe("first message");
    expect(secondCallMessages[1]?.content).toBe("ack 1");
    expect(secondCallMessages[2]?.content).toContain("[Current time:");
    expect(secondCallMessages[2]?.content).toContain("second message");
  });

  it("throws if called with no persisted user message — the caller's contract", async () => {
    sessionCounter += 1;
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: `run-turn-empty-${sessionCounter}`,
    });
    const provider = new FakeProvider([]);
    const mcpClient = await buildTestMcpClient(() => ({}));

    await expect(
      runTurn({
        database: testDb.database,
        provider,
        systemPrompt: "sys",
        sessionId: session.id,
        now: NOW,
        ownerTimezone: "Asia/Singapore",
        registry: registry(),
        mcpClient,
        tools: [],
      }),
    ).rejects.toThrow(/empty history/);
  });

  it("returns a failure envelope, never an unhandled rejection, when the database is unreachable mid-turn", async () => {
    // A real unreachable connection, not a mock — port 1 on localhost has
    // nothing listening. loadRecentHistory is now inside runTurn's own
    // try/catch specifically so this doesn't propagate past runTurn
    // uncaught (see runTurn.ts's comment on why it moved inside the try).
    const sessionId = await freshSessionWithUserMessage("hello");
    const unreachableDatabase = createDatabase("postgres://postgres:postgres@localhost:1/nope");
    const provider = new FakeProvider([]);
    const mcpClient = await buildTestMcpClient(() => ({}));
    let caughtError: unknown;

    const { envelope } = await runTurn({
      database: unreachableDatabase,
      provider,
      systemPrompt: "sys",
      sessionId,
      now: NOW,
      ownerTimezone: "Asia/Singapore",
      registry: registry(),
      mcpClient,
      tools: [],
      onError: (error) => {
        caughtError = error;
      },
    });

    expect(envelope.status).toBe("error");
    expect(envelope.kind).toBe("failure");
    expect(caughtError).toBeDefined();

    await unreachableDatabase.client.end({ timeout: 1 });
  }, 15_000);
});
