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

  it("resolves to one session when several calls race to create the same new channel", async () => {
    // A real concurrency test, not a mock: several calls for the same
    // brand-new channelId started together. All selects find nothing, all
    // attempt to insert, and the unique index forces all but one to lose —
    // exercising the fallback read on lines 42-54, which a purely
    // sequential test can't reach (the first call's own insert would
    // already satisfy a second call's initial select). Ten concurrent
    // callers rather than two, since two didn't reliably interleave enough
    // to lose the race against real Postgres over a pooled connection.
    const params = { userId: OWNER_USER_ID, channelType: "discord", channelId: "channel-race" };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => findOrCreateSession(testDb.database, params)),
    );

    const uniqueIds = new Set(results.map((r) => r.id));
    expect(uniqueIds.size).toBe(1);
  });
});
