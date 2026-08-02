import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, type TestDatabase } from "../testing.js";
import { ensureOwnerUser, OWNER_USER_ID } from "./users.js";
import { findOrCreateSession } from "./sessions.js";
import { insertAssistantMessage, insertUserMessage, loadRecentHistory } from "./messages.js";

describe("messages repository", () => {
  let testDb: TestDatabase;
  let sessionId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "channel-messages",
    });
    sessionId = session.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("inserts a user message with its platform id", async () => {
    const row = await insertUserMessage(testDb.database, {
      sessionId,
      content: "hello",
      platformMessageId: "discord-msg-1",
    });
    expect(row?.content).toBe("hello");
    expect(row?.role).toBe("user");
  });

  it("returns null for a duplicate platform_message_id — Requirement 5's durable dedup", async () => {
    const first = await insertUserMessage(testDb.database, {
      sessionId,
      content: "first",
      platformMessageId: "discord-msg-dup",
    });
    const second = await insertUserMessage(testDb.database, {
      sessionId,
      content: "resent (redelivered)",
      platformMessageId: "discord-msg-dup",
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const history = await loadRecentHistory(testDb.database, sessionId, 50);
    const matching = history.filter((m) => m.platformMessageId === "discord-msg-dup");
    expect(matching).toHaveLength(1);
  });

  it("inserts an assistant message with no platform id", async () => {
    const row = await insertAssistantMessage(testDb.database, {
      sessionId,
      content: "a reply",
    });
    expect(row.role).toBe("assistant");
    expect(row.platformMessageId).toBeNull();
  });

  it("loadRecentHistory returns the most recent N turns, oldest first", async () => {
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "channel-history",
    });

    for (let i = 0; i < 5; i += 1) {
      await insertUserMessage(testDb.database, {
        sessionId: session.id,
        content: `message ${i}`,
        platformMessageId: `history-${i}`,
      });
    }

    const history = await loadRecentHistory(testDb.database, session.id, 3);
    expect(history.map((m) => m.content)).toEqual(["message 2", "message 3", "message 4"]);
  });
});
