import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { startTestDatabase, type TestDatabase } from "../testing.js";
import { ensureOwnerUser, OWNER_USER_ID } from "./users.js";
import { findOrCreateSession } from "./sessions.js";
import { insertTurnUsage, listRecentTurnUsage } from "./turnUsage.js";
import { turnUsage } from "../schema.js";

describe("insertTurnUsage", () => {
  let testDb: TestDatabase;
  let sessionId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "turn-usage-repo-test",
    });
    sessionId = session.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("inserts a success row with full usage figures", async () => {
    await insertTurnUsage(testDb.database, {
      sessionId,
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      latencyMs: 1234,
      outcome: "success",
      toolCalls: 1,
    });

    const [row] = await testDb.database.db
      .select()
      .from(turnUsage)
      .where(sql`${turnUsage.sessionId} = ${sessionId}`)
      .orderBy(sql`${turnUsage.createdAt} desc`)
      .limit(1);

    expect(row).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      latencyMs: 1234,
      outcome: "success",
      toolCalls: 1,
    });
  });

  it("inserts a failure row with null token counts — there is no usage to report", async () => {
    await insertTurnUsage(testDb.database, {
      sessionId,
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: null,
      outputTokens: null,
      latencyMs: 500,
      outcome: "failure",
    });

    const [row] = await testDb.database.db
      .select()
      .from(turnUsage)
      .where(sql`${turnUsage.sessionId} = ${sessionId}`)
      .orderBy(sql`${turnUsage.createdAt} desc`)
      .limit(1);

    expect(row).toMatchObject({ outcome: "failure", inputTokens: null, outputTokens: null });
  });

  it("defaults cacheReadTokens and toolCalls to 0 when omitted", async () => {
    await insertTurnUsage(testDb.database, {
      sessionId,
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: 10,
      outputTokens: 2,
      latencyMs: 100,
      outcome: "success",
    });

    const [row] = await testDb.database.db
      .select()
      .from(turnUsage)
      .where(sql`${turnUsage.sessionId} = ${sessionId}`)
      .orderBy(sql`${turnUsage.createdAt} desc`)
      .limit(1);

    expect(row).toMatchObject({ cacheReadTokens: 0, toolCalls: 0 });
  });
});

describe("listRecentTurnUsage", () => {
  let testDb: TestDatabase;
  let sessionId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "list-recent-turn-usage-test",
    });
    sessionId = session.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns rows newest-first, including a failed turn's null token counts, capped at limit — phase_2a-db-visibility.md Requirement 6/7", async () => {
    await insertTurnUsage(testDb.database, {
      sessionId,
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: 100,
      outputTokens: 20,
      latencyMs: 100,
      outcome: "success",
    });
    await insertTurnUsage(testDb.database, {
      sessionId,
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: null,
      outputTokens: null,
      latencyMs: 50,
      outcome: "failure",
    });

    const rows = await listRecentTurnUsage(testDb.database, sessionId, 500);
    expect(rows[0]?.outcome).toBe("failure");
    expect(rows[0]?.inputTokens).toBeNull();
    expect(rows.at(-1)?.outcome).toBe("success");

    const limited = await listRecentTurnUsage(testDb.database, sessionId, 1);
    expect(limited).toHaveLength(1);
  });
});
