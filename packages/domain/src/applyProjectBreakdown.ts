import { z } from "zod";
import {
  carryForward,
  getCurrentProject,
  insertProjectRow,
  insertTaskRow,
  updateBatchJob,
  type BatchJobRow,
  type Database,
  type ProjectRow,
} from "@assistant/db";
import type { BatchProvider } from "@assistant/providers";
import { categorizeBatchOutcome } from "./batchOutcome.js";
import { MAX_TASK_MINUTES } from "./constants.js";

/**
 * Requirement 26: every failure path here propagates rather than being
 * silently converted into a soft result — the caller (apps/server's apply
 * orchestration) is expected to catch this specifically, mark nothing else
 * complete, and tell the owner. `category` is a mapped category, never a
 * raw provider error or raw parse exception (spec's Security section).
 */
export class BatchApplyFailure extends Error {
  constructor(
    public readonly category: string,
    public readonly subjectId: string,
  ) {
    super(`Batch apply failed for "${subjectId}": ${category}`);
    this.name = "BatchApplyFailure";
  }
}

export interface ProjectBreakdownApplyResult {
  projectId: string;
  projectTitle: string;
  appliedCount: number;
  discardedCount: number;
}

const GeneratedTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  estimatedMinutes: z.number().int().positive(),
});

function toInsertProjectParams(row: Omit<ProjectRow, "rowId" | "createdAt">): Parameters<typeof insertProjectRow>[1] {
  return {
    projectId: row.projectId,
    userId: row.userId,
    title: row.title,
    description: row.description ?? undefined,
    targetDate: row.targetDate ?? undefined,
    status: row.status,
    taskGenerationStatus: row.taskGenerationStatus,
  };
}

async function markProjectFailed(database: Database, project: ProjectRow): Promise<void> {
  const carried = carryForward(project, { taskGenerationStatus: "failed" });
  await insertProjectRow(database, toInsertProjectParams(carried));
}

/**
 * Requirement 24: validates the batch's per-task output before applying
 * any of it — a task exceeding `MAX_TASK_MINUTES` is discarded, not
 * clamped, and counted; the same holds for a task that fails the field
 * schema entirely (validated per-item, not as one all-or-nothing array, so
 * one bad task doesn't take the rest down with it).
 */
export async function applyProjectBreakdown(
  database: Database,
  batchProvider: BatchProvider,
  job: BatchJobRow,
  context: { ownerUserId: string },
): Promise<ProjectBreakdownApplyResult> {
  const project = await getCurrentProject(database, job.subjectId);
  if (!project) {
    throw new BatchApplyFailure("project_not_found", job.subjectId);
  }

  const results = await batchProvider.fetchResults(job.providerBatchId);
  const result = results.find((item) => item.customId === job.subjectId);

  if (!result || result.outcome.type !== "succeeded") {
    const category = categorizeBatchOutcome(result);
    await markProjectFailed(database, project);
    await updateBatchJob(database, job.id, { status: "failed", failureCategory: category });
    throw new BatchApplyFailure(category, job.subjectId);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.outcome.text);
  } catch {
    await markProjectFailed(database, project);
    await updateBatchJob(database, job.id, { status: "failed", failureCategory: "invalid_json" });
    throw new BatchApplyFailure("invalid_json", job.subjectId);
  }

  const rawArray = z.array(z.unknown()).safeParse(parsed);
  if (!rawArray.success) {
    await markProjectFailed(database, project);
    await updateBatchJob(database, job.id, { status: "failed", failureCategory: "invalid_shape" });
    throw new BatchApplyFailure("invalid_shape", job.subjectId);
  }

  let appliedCount = 0;
  let discardedCount = 0;
  for (const rawItem of rawArray.data) {
    const itemResult = GeneratedTaskSchema.safeParse(rawItem);
    if (!itemResult.success || itemResult.data.estimatedMinutes > MAX_TASK_MINUTES) {
      discardedCount += 1;
      continue;
    }
    await insertTaskRow(database, {
      userId: context.ownerUserId,
      projectId: project.projectId,
      title: itemResult.data.title,
      description: itemResult.data.description,
      estimatedMinutes: itemResult.data.estimatedMinutes,
      source: "generated",
    });
    appliedCount += 1;
  }

  const carried = carryForward(project, { taskGenerationStatus: "ready" });
  await insertProjectRow(database, toInsertProjectParams(carried));
  await updateBatchJob(database, job.id, {
    status: "applied",
    appliedAt: new Date(),
    inputTokens: result.outcome.usage.inputTokens,
    outputTokens: result.outcome.usage.outputTokens,
  });

  return {
    projectId: project.projectId,
    projectTitle: project.title,
    appliedCount,
    discardedCount,
  };
}
