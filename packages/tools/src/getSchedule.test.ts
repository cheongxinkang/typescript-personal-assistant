import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { getScheduleTool } from "./getSchedule.js";
import type { ToolContext } from "./toolDefinition.js";

describe("getScheduleTool.handler", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function context(now: Date): ToolContext {
    return { database: testDb.database, now, ownerTimezone: "Asia/Singapore", ownerUserId: OWNER_USER_ID };
  }

  it("delegates to the domain function and returns day groups", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const result = await getScheduleTool.handler({ start: "today", end: "+2d" }, context(now));
    expect(result.days).toHaveLength(3);
  });
});
