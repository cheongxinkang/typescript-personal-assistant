import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, insertEventRow, insertGenerationRun, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { confirmScheduleTool } from "./confirmSchedule.js";
import type { ToolContext } from "./toolDefinition.js";

describe("confirmScheduleTool.handler", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("delegates to the domain function and confirms proposed events", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const horizonStart = new Date("2026-09-01T00:00:00.000Z");
    const horizonEnd = new Date("2026-09-08T00:00:00.000Z");
    const run = await insertGenerationRun(testDb.database, {
      userId: OWNER_USER_ID,
      horizonStart,
      horizonEnd,
      placedCount: 1,
      overflow: [],
    });
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Proposed",
      startsAt: new Date("2026-09-02T01:00:00.000Z"),
      durationMinutes: 30,
      status: "proposed",
    });

    const context: ToolContext = {
      database: testDb.database,
      now,
      ownerTimezone: "Asia/Singapore",
      ownerUserId: OWNER_USER_ID,
    };

    const result = await confirmScheduleTool.handler({ generationRunId: run.id }, context);
    expect(result.confirmedEventIds).toHaveLength(1);
  });
});
