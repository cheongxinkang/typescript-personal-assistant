import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureOwnerUser,
  getCurrentEvent,
  insertEventRow,
  insertGenerationRun,
  OWNER_USER_ID,
} from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { confirmSchedule } from "./confirmSchedule.js";
import type { DomainContext } from "./context.js";
import { NotFoundError } from "./errors.js";

describe("confirmSchedule (domain)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function context(now: Date): DomainContext {
    return { now, ownerTimezone: "Asia/Singapore", ownerUserId: OWNER_USER_ID };
  }

  it("promotes every proposed event in the run's horizon to planned, each as a new row", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const horizonStart = new Date("2026-09-01T00:00:00.000Z");
    const horizonEnd = new Date("2026-09-08T00:00:00.000Z");
    const run = await insertGenerationRun(testDb.database, {
      userId: OWNER_USER_ID,
      horizonStart,
      horizonEnd,
      placedCount: 2,
      overflow: [],
    });
    const proposedA = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Proposed A",
      startsAt: new Date("2026-09-02T01:00:00.000Z"),
      durationMinutes: 30,
      status: "proposed",
    });
    const proposedB = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Proposed B",
      startsAt: new Date("2026-09-03T01:00:00.000Z"),
      durationMinutes: 60,
      status: "proposed",
    });

    const result = await confirmSchedule(testDb.database, { generationRunId: run.id }, context(now));

    expect(result.confirmedEventIds).toHaveLength(2);

    const rowA = await getCurrentEvent(testDb.database, proposedA.eventId);
    const rowB = await getCurrentEvent(testDb.database, proposedB.eventId);
    expect(rowA?.status).toBe("planned");
    expect(rowB?.status).toBe("planned");
    // Confirmed by appending a new row, not by updating the original.
    expect(rowA?.rowId).not.toBe(proposedA.rowId);
  });

  it("does not touch an event outside the run's horizon", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const horizonStart = new Date("2026-09-10T00:00:00.000Z");
    const horizonEnd = new Date("2026-09-17T00:00:00.000Z");
    const run = await insertGenerationRun(testDb.database, {
      userId: OWNER_USER_ID,
      horizonStart,
      horizonEnd,
      placedCount: 0,
      overflow: [],
    });
    const outside = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Outside the horizon",
      startsAt: new Date("2026-10-01T01:00:00.000Z"),
      durationMinutes: 30,
      status: "proposed",
    });

    await confirmSchedule(testDb.database, { generationRunId: run.id }, context(now));

    const row = await getCurrentEvent(testDb.database, outside.eventId);
    expect(row?.status).toBe("proposed");
  });

  it("throws NotFoundError for a well-formed but non-existent generationRunId", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await expect(
      confirmSchedule(
        testDb.database,
        { generationRunId: "00000000-0000-0000-0000-000000000000" },
        context(now),
      ),
    ).rejects.toThrow(NotFoundError);
  });
});
