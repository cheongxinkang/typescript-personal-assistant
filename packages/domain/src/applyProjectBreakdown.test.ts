import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBatchJob, getCurrentProject, insertBatchJob, insertProjectRow, OWNER_USER_ID, ensureOwnerUser } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { FakeBatchProvider } from "@assistant/providers";
import { applyProjectBreakdown, BatchApplyFailure } from "./applyProjectBreakdown.js";

describe("applyProjectBreakdown (domain)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("applies valid tasks and discards an over-estimate, reporting the count — Requirement 24", async () => {
    const project = await insertProjectRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Rewrite the personal site",
      description: "A static site with a blog.",
      taskGenerationStatus: "pending",
    });
    const provider = new FakeBatchProvider();
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "ended", requestCounts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 }, endedAt: new Date() }],
      [
        {
          customId: project.projectId,
          outcome: {
            type: "succeeded",
            text: JSON.stringify([
              { title: "Pick a static site generator", estimatedMinutes: 120 },
              { title: "Migrate posts", estimatedMinutes: 240 },
              { title: "Way too big", estimatedMinutes: 600 },
            ]),
            model: "fake",
            usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0 },
          },
        },
      ],
    );
    await provider.submit([{ customId: project.projectId, systemPrompt: "sys", messages: [] }]);
    const job = await insertBatchJob(testDb.database, {
      kind: "project_task_breakdown",
      subjectId: project.projectId,
      providerBatchId,
    });

    const result = await applyProjectBreakdown(testDb.database, provider, job, { ownerUserId: OWNER_USER_ID });

    expect(result.appliedCount).toBe(2);
    expect(result.discardedCount).toBe(1);

    const updatedProject = await getCurrentProject(testDb.database, project.projectId);
    expect(updatedProject?.taskGenerationStatus).toBe("ready");

    const updatedJob = await getBatchJob(testDb.database, job.id);
    expect(updatedJob?.status).toBe("applied");
    expect(updatedJob?.inputTokens).toBe(100);
  });

  it("throws and marks the project failed when the batch content is unparseable — Requirement 24", async () => {
    const project = await insertProjectRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Broken project",
      description: "desc",
      taskGenerationStatus: "pending",
    });
    const provider = new FakeBatchProvider();
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "ended", requestCounts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 }, endedAt: new Date() }],
      [
        {
          customId: project.projectId,
          outcome: {
            type: "succeeded",
            text: "not valid json {{{",
            model: "fake",
            usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
          },
        },
      ],
    );
    await provider.submit([{ customId: project.projectId, systemPrompt: "sys", messages: [] }]);
    const job = await insertBatchJob(testDb.database, {
      kind: "project_task_breakdown",
      subjectId: project.projectId,
      providerBatchId,
    });

    await expect(
      applyProjectBreakdown(testDb.database, provider, job, { ownerUserId: OWNER_USER_ID }),
    ).rejects.toThrow(BatchApplyFailure);

    const updatedProject = await getCurrentProject(testDb.database, project.projectId);
    expect(updatedProject?.taskGenerationStatus).toBe("failed");

    const updatedJob = await getBatchJob(testDb.database, job.id);
    expect(updatedJob?.status).toBe("failed");
  });

  it("throws and marks the project failed when the batch itself errored", async () => {
    const project = await insertProjectRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Errored project",
      description: "desc",
      taskGenerationStatus: "pending",
    });
    const provider = new FakeBatchProvider();
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "ended", requestCounts: { processing: 0, succeeded: 0, errored: 1, canceled: 0, expired: 0 }, endedAt: new Date() }],
      [{ customId: project.projectId, outcome: { type: "errored", category: "not_found_error" } }],
    );
    await provider.submit([{ customId: project.projectId, systemPrompt: "sys", messages: [] }]);
    const job = await insertBatchJob(testDb.database, {
      kind: "project_task_breakdown",
      subjectId: project.projectId,
      providerBatchId,
    });

    await expect(
      applyProjectBreakdown(testDb.database, provider, job, { ownerUserId: OWNER_USER_ID }),
    ).rejects.toThrow(BatchApplyFailure);

    const updatedJob = await getBatchJob(testDb.database, job.id);
    expect(updatedJob?.failureCategory).toBe("not_found_error");
  });
});
