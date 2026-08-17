import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { FakeBatchProvider } from "@assistant/providers";
import { generateScheduleTool } from "./generateSchedule.js";
import type { ToolContext } from "./toolDefinition.js";

describe("generateScheduleTool.handler", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("delegates to the domain function and returns an acknowledgement", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const provider = new FakeBatchProvider();
    const context: ToolContext = {
      database: testDb.database,
      now,
      ownerTimezone: "Asia/Singapore",
      ownerUserId: OWNER_USER_ID,
      batchProvider: provider,
    };

    const result = await generateScheduleTool.handler({}, context);
    expect(result.generationRunId).toBeDefined();
  });
});
