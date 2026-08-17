import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startTestDatabase, type TestDatabase } from "../testing.js";
import {
  getBatchJob,
  insertBatchJob,
  listNonTerminalBatchJobs,
  updateBatchJob,
} from "./batchJobs.js";

describe("batchJobs repository", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("inserts a job in the submitted status by default", async () => {
    const job = await insertBatchJob(testDb.database, {
      kind: "project_task_breakdown",
      subjectId: randomUUID(),
      providerBatchId: "msgbatch_1",
    });
    expect(job.status).toBe("submitted");
    expect(job.attempts).toBe(0);
  });

  it("updates fields via a real UPDATE (ordinary mutable table)", async () => {
    const job = await insertBatchJob(testDb.database, {
      kind: "schedule_generation",
      subjectId: randomUUID(),
      providerBatchId: "msgbatch_2",
    });

    await updateBatchJob(testDb.database, job.id, {
      status: "ended",
      inputTokens: 100,
      outputTokens: 40,
      endedAt: new Date("2026-08-03T00:00:00.000Z"),
    });

    const updated = await getBatchJob(testDb.database, job.id);
    expect(updated?.status).toBe("ended");
    expect(updated?.inputTokens).toBe(100);
    expect(updated?.endedAt).toEqual(new Date("2026-08-03T00:00:00.000Z"));
  });

  it("lists only non-terminal jobs for the poller", async () => {
    const submitted = await insertBatchJob(testDb.database, {
      kind: "project_task_breakdown",
      subjectId: randomUUID(),
      providerBatchId: "msgbatch_3",
    });
    const applied = await insertBatchJob(testDb.database, {
      kind: "project_task_breakdown",
      subjectId: randomUUID(),
      providerBatchId: "msgbatch_4",
    });
    await updateBatchJob(testDb.database, applied.id, { status: "applied" });

    const nonTerminal = await listNonTerminalBatchJobs(testDb.database);
    const ids = nonTerminal.map((j) => j.id);
    expect(ids).toContain(submitted.id);
    expect(ids).not.toContain(applied.id);
  });
});
