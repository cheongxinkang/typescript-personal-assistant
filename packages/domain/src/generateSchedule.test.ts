import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, insertEventRow, insertTaskRow, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { FakeBatchProvider } from "@assistant/providers";
import type { DomainContext } from "./context.js";
import { generateSchedule } from "./generateSchedule.js";

describe("generateSchedule (domain)", () => {
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

  it("submits a batch ordering request when unscheduled open tasks exist", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Open, unscheduled task" });
    const provider = new FakeBatchProvider();
    provider.scriptNextBatch(
      [{ status: "in_progress", requestCounts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 }, endedAt: null }],
      [],
    );

    const result = await generateSchedule({ database: testDb.database, batchProvider: provider }, {}, context(now));

    expect(result.submitted).toBe(true);
    expect(provider.submittedBatches).toHaveLength(1);
  });

  it("excludes a task that already has a non-cancelled event from the candidate set — Requirement 20", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Do-not-include-me-marker-task",
    });
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Already scheduled session",
      startsAt: new Date("2026-08-05T01:00:00.000Z"),
      durationMinutes: 30,
      taskId: task.taskId,
    });
    const provider = new FakeBatchProvider();
    provider.scriptNextBatch(
      [{ status: "in_progress", requestCounts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 }, endedAt: null }],
      [],
    );

    await generateSchedule({ database: testDb.database, batchProvider: provider }, {}, context(now));

    // Whatever batch was submitted (there may be candidates left over from
    // other tests in this shared database), it must never mention this
    // specific already-scheduled task's id.
    const submittedContent = JSON.stringify(provider.submittedBatches[0]);
    expect(submittedContent).not.toContain(task.taskId);
  });

  it("reports submitted: false and creates no batch job when there are no candidates at all", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    // Use an isolated database for a clean "no tasks at all" state.
    const isolatedDb = await startTestDatabase();
    await ensureOwnerUser(isolatedDb.database, "Asia/Singapore");
    const provider = new FakeBatchProvider();

    const result = await generateSchedule(
      { database: isolatedDb.database, batchProvider: provider },
      {},
      context(now),
    );

    expect(result.submitted).toBe(false);
    expect(provider.submittedBatches).toHaveLength(0);
    await isolatedDb.teardown();
  }, 60_000);
});
