import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixedClock } from "@assistant/core";
import { FakeProvider } from "@assistant/providers";
import {
  ensureOwnerUser,
  findOrCreateSession,
  insertUserMessage,
  loadRecentHistory,
  OWNER_USER_ID,
} from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { runTurn } from "./runTurn.js";

const NOW = new Date("2026-08-02T23:00:00.000Z"); // 2026-08-03T07:00 SGT

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

  it("persists the assistant reply and a success turn_usage row on success", async () => {
    const sessionId = await freshSessionWithUserMessage("hello");
    const provider = new FakeProvider([
      {
        text: "Hi there!",
        model: "fake-model",
        usage: { inputTokens: 10, outputTokens: 3, cacheReadTokens: 0 },
      },
    ]);

    const { envelope } = await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "You are helpful.",
      sessionId,
      clock: new FixedClock(NOW),
      ownerTimezone: "Asia/Singapore",
    });

    expect(envelope).toEqual({
      status: "success",
      kind: "conversational",
      data: { text: "Hi there!" },
    });

    const history = await loadRecentHistory(testDb.database, sessionId, 10);
    expect(history.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "Hi there!" },
    ]);
  });

  it("returns a failure envelope and a failure turn_usage row when the provider throws", async () => {
    const sessionId = await freshSessionWithUserMessage("hello");
    const provider = new FakeProvider([new Error("network error")]);
    let caughtError: unknown;

    const { envelope } = await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "sys",
      sessionId,
      clock: new FixedClock(NOW),
      ownerTimezone: "Asia/Singapore",
      onError: (error) => {
        caughtError = error;
      },
    });

    expect(envelope.status).toBe("error");
    expect(envelope.kind).toBe("failure");
    if (envelope.status === "error") {
      expect(envelope.data).toMatchObject({ message: expect.any(String) });
      expect(envelope.data).not.toMatchObject({ message: expect.stringContaining("network error") });
    }
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe("network error");

    // No assistant message was persisted — there is no reply to store.
    const history = await loadRecentHistory(testDb.database, sessionId, 10);
    expect(history.every((m) => m.role === "user")).toBe(true);
  });

  it("wraps only the latest user message with the current-time envelope, leaving earlier history untouched", async () => {
    const sessionId = await freshSessionWithUserMessage("first message");
    const provider = new FakeProvider([
      { text: "ack 1", model: "fake-model", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } },
      { text: "ack 2", model: "fake-model", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } },
    ]);

    await runTurn({
      database: testDb.database,
      provider,
      systemPrompt: "sys",
      sessionId,
      clock: new FixedClock(NOW),
      ownerTimezone: "Asia/Singapore",
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
      clock: new FixedClock(NOW),
      ownerTimezone: "Asia/Singapore",
    });

    const secondCallMessages = provider.calls[1]?.messages ?? [];
    // Earlier turns (first message, first assistant reply) sent as raw
    // stored content — no timestamp envelope.
    expect(secondCallMessages[0]?.content).toBe("first message");
    expect(secondCallMessages[1]?.content).toBe("ack 1");
    // Only the newest user message carries the envelope.
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

    await expect(
      runTurn({
        database: testDb.database,
        provider,
        systemPrompt: "sys",
        sessionId: session.id,
        clock: new FixedClock(NOW),
        ownerTimezone: "Asia/Singapore",
      }),
    ).rejects.toThrow(/empty history/);
  });
});
