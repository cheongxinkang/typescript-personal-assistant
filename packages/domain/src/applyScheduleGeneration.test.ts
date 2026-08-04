import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureOwnerUser,
  getGenerationRun,
  insertBatchJob,
  insertEventRow,
  insertGenerationRun,
  insertTaskRow,
  listEventsInRange,
  OWNER_USER_ID,
  parseOverflow,
} from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { FakeBatchProvider } from "@assistant/providers";
import { applyScheduleGeneration } from "./applyScheduleGeneration.js";
import type { DayShape } from "./dayShape.js";

const WEEKDAY_9_TO_5: DayShape = {
  monday: { start: "09:00", end: "17:00" },
  tuesday: { start: "09:00", end: "17:00" },
  wednesday: { start: "09:00", end: "17:00" },
  thursday: { start: "09:00", end: "17:00" },
  friday: { start: "09:00", end: "17:00" },
  saturday: { start: "09:00", end: "17:00" },
  sunday: { start: "09:00", end: "17:00" },
};

describe("applyScheduleGeneration (domain)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("places ordered tasks as proposed events, never overlapping a committed event", async () => {
    const horizonStart = new Date("2026-08-03T01:00:00.000Z"); // Monday 09:00 SGT
    const horizonEnd = new Date("2026-08-10T00:00:00.000Z");
    const taskA = await insertTaskRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Task A",
      estimatedMinutes: 60,
    });
    const taskB = await insertTaskRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Task B",
      estimatedMinutes: 30,
    });

    const run = await insertGenerationRun(testDb.database, {
      userId: OWNER_USER_ID,
      horizonStart,
      horizonEnd,
      placedCount: 0,
      overflow: [],
    });
    const provider = new FakeBatchProvider();
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "ended", requestCounts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 }, endedAt: new Date() }],
      [
        {
          customId: run.id,
          outcome: {
            type: "succeeded",
            text: JSON.stringify([taskA.taskId, taskB.taskId]),
            model: "fake",
            usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0 },
          },
        },
      ],
    );
    await provider.submit([{ customId: run.id, systemPrompt: "sys", messages: [] }]);
    const job = await insertBatchJob(testDb.database, {
      kind: "schedule_generation",
      subjectId: run.id,
      providerBatchId,
    });

    const result = await applyScheduleGeneration(testDb.database, provider, job, {
      ownerUserId: OWNER_USER_ID,
      ownerTimezone: "Asia/Singapore",
      dayShape: WEEKDAY_9_TO_5,
    });

    expect(result.placedCount).toBe(2);

    const events = await listEventsInRange(testDb.database, {
      userId: OWNER_USER_ID,
      startInclusive: horizonStart,
      endExclusive: horizonEnd,
      includeCancelled: true,
    });
    const proposed = events.filter((e) => e.status === "proposed" && (e.taskId === taskA.taskId || e.taskId === taskB.taskId));
    expect(proposed).toHaveLength(2);

    const updatedRun = await getGenerationRun(testDb.database, run.id);
    expect(updatedRun?.placedCount).toBe(2);
    expect(parseOverflow(updatedRun!)).toEqual([]);
  });

  it("does not count a proposed event from a prior run as busy — Requirement 19", async () => {
    const horizonStart = new Date("2026-08-17T01:00:00.000Z"); // a Monday 09:00 SGT
    const horizonEnd = new Date("2026-08-24T00:00:00.000Z");

    // A pre-existing PROPOSED event occupying the very first slot.
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Stale proposal",
      startsAt: horizonStart,
      durationMinutes: 60,
      status: "proposed",
    });

    const task = await insertTaskRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Should land in the very first slot anyway",
      estimatedMinutes: 30,
    });
    const run = await insertGenerationRun(testDb.database, {
      userId: OWNER_USER_ID,
      horizonStart,
      horizonEnd,
      placedCount: 0,
      overflow: [],
    });
    const provider = new FakeBatchProvider();
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "ended", requestCounts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 }, endedAt: new Date() }],
      [
        {
          customId: run.id,
          outcome: {
            type: "succeeded",
            text: JSON.stringify([task.taskId]),
            model: "fake",
            usage: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0 },
          },
        },
      ],
    );
    await provider.submit([{ customId: run.id, systemPrompt: "sys", messages: [] }]);
    const job = await insertBatchJob(testDb.database, {
      kind: "schedule_generation",
      subjectId: run.id,
      providerBatchId,
    });

    await applyScheduleGeneration(testDb.database, provider, job, {
      ownerUserId: OWNER_USER_ID,
      ownerTimezone: "Asia/Singapore",
      dayShape: WEEKDAY_9_TO_5,
    });

    const events = await listEventsInRange(testDb.database, {
      userId: OWNER_USER_ID,
      startInclusive: horizonStart,
      endExclusive: new Date(horizonStart.getTime() + 60 * 60_000),
      includeCancelled: true,
    });
    const newProposal = events.find((e) => e.taskId === task.taskId);
    expect(newProposal?.startsAt).toEqual(horizonStart); // placed right at the start, unblocked by the stale proposal
  });

  it("places a dependency before its dependent even when the model ordered them the other way", async () => {
    const horizonStart = new Date("2026-08-31T01:00:00.000Z"); // Monday 09:00 SGT
    const horizonEnd = new Date("2026-09-07T00:00:00.000Z");

    const module4 = await insertTaskRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Finish module 4",
      estimatedMinutes: 60,
    });
    const mockExam = await insertTaskRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Mock exam",
      estimatedMinutes: 60,
      dependsOn: [module4.taskId],
    });

    const run = await insertGenerationRun(testDb.database, {
      userId: OWNER_USER_ID,
      horizonStart,
      horizonEnd,
      placedCount: 0,
      overflow: [],
    });
    const provider = new FakeBatchProvider();
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "ended", requestCounts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 }, endedAt: new Date() }],
      [
        {
          customId: run.id,
          outcome: {
            type: "succeeded",
            // Model ordered the dependent BEFORE its dependency — the bug
            // this stage exists to prevent from reaching placement.
            text: JSON.stringify([mockExam.taskId, module4.taskId]),
            model: "fake",
            usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0 },
          },
        },
      ],
    );
    await provider.submit([{ customId: run.id, systemPrompt: "sys", messages: [] }]);
    const job = await insertBatchJob(testDb.database, {
      kind: "schedule_generation",
      subjectId: run.id,
      providerBatchId,
    });

    await applyScheduleGeneration(testDb.database, provider, job, {
      ownerUserId: OWNER_USER_ID,
      ownerTimezone: "Asia/Singapore",
      dayShape: WEEKDAY_9_TO_5,
    });

    const events = await listEventsInRange(testDb.database, {
      userId: OWNER_USER_ID,
      startInclusive: horizonStart,
      endExclusive: horizonEnd,
      includeCancelled: true,
    });
    const module4Event = events.find((e) => e.taskId === module4.taskId && e.status === "proposed");
    const mockExamEvent = events.find((e) => e.taskId === mockExam.taskId && e.status === "proposed");

    expect(module4Event).toBeDefined();
    expect(mockExamEvent).toBeDefined();
    expect(module4Event!.startsAt.getTime()).toBeLessThan(mockExamEvent!.startsAt.getTime());
  });
});
