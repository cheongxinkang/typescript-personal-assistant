import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChannelAdapter, MessageHandler } from "@assistant/core";
import {
  ensureOwnerUser,
  getBatchJob,
  getCurrentProject,
  insertBatchJob,
  insertProjectRow,
  OWNER_USER_ID,
  updateBatchJob,
} from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { FakeBatchProvider } from "@assistant/providers";
import { applyEndedBatchJobsOnce } from "./applyBatchJobs.js";

class FakeChannelAdapter implements ChannelAdapter {
  readonly sent: string[] = [];
  async start(_onMessage: MessageHandler): Promise<void> {}
  async stop(): Promise<void> {}
  async sendToConfiguredChannel(text: string): Promise<void> {
    this.sent.push(text);
  }
}

const NOOP_LOGGER = { info: () => undefined, error: () => undefined };

describe("applyEndedBatchJobsOnce", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("applies an ended project breakdown job and sends an unprompted completion message", async () => {
    const project = await insertProjectRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Rewrite the personal site",
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
            text: JSON.stringify([{ title: "Task 1", estimatedMinutes: 60 }]),
            model: "fake",
            usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 },
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
    await updateBatchJob(testDb.database, job.id, { status: "ended", endedAt: new Date() });

    const adapter = new FakeChannelAdapter();
    await applyEndedBatchJobsOnce(
      testDb.database,
      provider,
      adapter,
      { ownerUserId: OWNER_USER_ID, ownerTimezone: "Asia/Singapore", dayShape: {} },
      NOOP_LOGGER,
    );

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]).toContain("Rewrite the personal site");

    const updatedProject = await getCurrentProject(testDb.database, project.projectId);
    expect(updatedProject?.taskGenerationStatus).toBe("ready");
    const updatedJob = await getBatchJob(testDb.database, job.id);
    expect(updatedJob?.status).toBe("applied");
  });

  it("sends a failure message and never marks the project complete when the apply fails", async () => {
    const project = await insertProjectRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Broken",
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
            text: "not json",
            model: "fake",
            usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
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
    await updateBatchJob(testDb.database, job.id, { status: "ended", endedAt: new Date() });

    const adapter = new FakeChannelAdapter();
    await applyEndedBatchJobsOnce(
      testDb.database,
      provider,
      adapter,
      { ownerUserId: OWNER_USER_ID, ownerTimezone: "Asia/Singapore", dayShape: {} },
      NOOP_LOGGER,
    );

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]).toContain("failed");

    const updatedProject = await getCurrentProject(testDb.database, project.projectId);
    expect(updatedProject?.taskGenerationStatus).toBe("failed");
  });

  it("is a no-op when there are no ended jobs", async () => {
    const provider = new FakeBatchProvider();
    const adapter = new FakeChannelAdapter();
    await applyEndedBatchJobsOnce(
      testDb.database,
      provider,
      adapter,
      { ownerUserId: OWNER_USER_ID, ownerTimezone: "Asia/Singapore", dayShape: {} },
      NOOP_LOGGER,
    );
    expect(adapter.sent).toHaveLength(0);
  });
});
