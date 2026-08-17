import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBatchJob, insertBatchJob } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { FakeBatchProvider } from "@assistant/providers";
import { pollBatchJobsOnce } from "./poller.js";

describe("pollBatchJobsOnce", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("moves a still-processing job to 'polling' and increments attempts", async () => {
    const provider = new FakeBatchProvider();
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "in_progress", requestCounts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 }, endedAt: null }],
      [],
    );
    await provider.submit([{ customId: "c1", systemPrompt: "sys", messages: [] }]);
    const job = await insertBatchJob(testDb.database, {
      kind: "project_task_breakdown",
      subjectId: randomUUID(),
      providerBatchId,
    });

    await pollBatchJobsOnce(testDb.database, provider, new Date());

    const updated = await getBatchJob(testDb.database, job.id);
    expect(updated?.status).toBe("polling");
    expect(updated?.attempts).toBe(1);
  });

  it("moves an ended job to 'ended' with endedAt set", async () => {
    const provider = new FakeBatchProvider();
    const endedAt = new Date("2026-08-03T00:00:00.000Z");
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "ended", requestCounts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 }, endedAt }],
      [],
    );
    await provider.submit([{ customId: "c1", systemPrompt: "sys", messages: [] }]);
    const job = await insertBatchJob(testDb.database, {
      kind: "schedule_generation",
      subjectId: randomUUID(),
      providerBatchId,
    });

    await pollBatchJobsOnce(testDb.database, provider, new Date());

    const updated = await getBatchJob(testDb.database, job.id);
    expect(updated?.status).toBe("ended");
    expect(updated?.endedAt).toEqual(endedAt);
  });

  it("marks a job failed with category 'expired' past BATCH_MAX_AGE_HOURS, without calling the provider", async () => {
    const provider = new FakeBatchProvider(); // no script registered — would throw if called
    const job = await insertBatchJob(testDb.database, {
      kind: "project_task_breakdown",
      subjectId: randomUUID(),
      providerBatchId: "irrelevant",
      submittedAt: new Date("2026-08-01T00:00:00.000Z"), // 27h+ before `now` below
    });

    await pollBatchJobsOnce(testDb.database, provider, new Date("2026-08-02T04:00:00.000Z"));

    const updated = await getBatchJob(testDb.database, job.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failureCategory).toBe("expired");
  });

  it("marks a job failed with category 'poll_error' when checkStatus throws, never storing the raw error", async () => {
    const provider = new FakeBatchProvider(); // no script -> checkStatus throws
    const job = await insertBatchJob(testDb.database, {
      kind: "project_task_breakdown",
      subjectId: randomUUID(),
      providerBatchId: "unscripted-id",
    });

    await pollBatchJobsOnce(testDb.database, provider, new Date());

    const updated = await getBatchJob(testDb.database, job.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failureCategory).toBe("poll_error");
  });

  it("is safe to run twice in a row — the second run is a no-op for an already-terminal job", async () => {
    const provider = new FakeBatchProvider();
    const endedAt = new Date("2026-08-03T00:00:00.000Z");
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "ended", requestCounts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 }, endedAt }],
      [],
    );
    await provider.submit([{ customId: "c1", systemPrompt: "sys", messages: [] }]);
    const job = await insertBatchJob(testDb.database, {
      kind: "schedule_generation",
      subjectId: randomUUID(),
      providerBatchId,
    });

    await pollBatchJobsOnce(testDb.database, provider, new Date());
    await pollBatchJobsOnce(testDb.database, provider, new Date());

    const updated = await getBatchJob(testDb.database, job.id);
    expect(updated?.status).toBe("ended");
    expect(updated?.attempts).toBe(1); // second tick never touched it — it's no longer non-terminal
  });

  it("two concurrent ticks contend for the same advisory lock — only one runs", async () => {
    const provider = new FakeBatchProvider();
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "in_progress", requestCounts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 }, endedAt: null }],
      [],
    );
    await provider.submit([{ customId: "c1", systemPrompt: "sys", messages: [] }]);
    const job = await insertBatchJob(testDb.database, {
      kind: "project_task_breakdown",
      subjectId: randomUUID(),
      providerBatchId,
    });

    await Promise.all([
      pollBatchJobsOnce(testDb.database, provider, new Date()),
      pollBatchJobsOnce(testDb.database, provider, new Date()),
    ]);

    const updated = await getBatchJob(testDb.database, job.id);
    // If both ticks ran, attempts would be 2; the lock guarantees only one did.
    expect(updated?.attempts).toBe(1);
  });
});
