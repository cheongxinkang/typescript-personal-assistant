import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, type TestDatabase } from "../testing.js";
import { ensureOwnerUser, OWNER_USER_ID } from "./users.js";
import { findOrCreateSession } from "./sessions.js";

describe("findOrCreateSession", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates a session for a new channel", async () => {
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "channel-a",
    });
    expect(session.channelId).toBe("channel-a");
    expect(session.userId).toBe(OWNER_USER_ID);
  });

  it("returns the same session for a channel it already created", async () => {
    const first = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "channel-b",
    });
    const second = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "channel-b",
    });
    expect(second.id).toBe(first.id);
  });

  it("treats different channel ids as different sessions", async () => {
    const a = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "channel-c1",
    });
    const b = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "channel-c2",
    });
    expect(a.id).not.toBe(b.id);
  });
});
