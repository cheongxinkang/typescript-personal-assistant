import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixedClock } from "@assistant/core";
import { FakeProvider } from "@assistant/providers";
import { ensureOwnerUser, findOrCreateSession, insertUserMessage, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { runTurn } from "./runTurn.js";
import { workflowCompletion } from "./workflowCompletion.js";

/**
 * Requirement 8, asserted directly as the contract it is: on an identical
 * provider failure, runTurn and workflowCompletion behave oppositely. A
 * caller that can't tell success from failure will silently consume state
 * (ARCHITECTURE.md §3.2) — this is the property that prevents it, proven
 * for both call paths in one place rather than left to be inferred from
 * two separate test files.
 */
describe("runTurn vs workflowCompletion — failure semantics, as a pair", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("runTurn converts a provider failure into a returned error envelope, never throwing", async () => {
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "call-paths-runturn",
    });
    await insertUserMessage(testDb.database, {
      sessionId: session.id,
      content: "hello",
      platformMessageId: "call-paths-msg-1",
    });

    const provider = new FakeProvider([new Error("boom")]);

    await expect(
      runTurn({
        database: testDb.database,
        provider,
        systemPrompt: "sys",
        sessionId: session.id,
        clock: new FixedClock(new Date("2026-08-02T23:00:00.000Z")),
        ownerTimezone: "Asia/Singapore",
      }),
    ).resolves.toMatchObject({ envelope: { status: "error", kind: "failure" } });
  });

  it("workflowCompletion propagates the identical provider failure by throwing", async () => {
    const provider = new FakeProvider([new Error("boom")]);

    await expect(
      workflowCompletion({ provider, systemPrompt: "sys", userText: "hello" }),
    ).rejects.toThrow("boom");
  });
});
