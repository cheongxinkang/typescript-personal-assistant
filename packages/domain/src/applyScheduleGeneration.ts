import { z } from "zod";
import {
  getGenerationRun,
  insertEventRow,
  listEventsInRange,
  listNonCancelledEventsByTaskId,
  listOpenTasks,
  updateBatchJob,
  updateGenerationRun,
  type BatchJobRow,
  type Database,
  type OverflowEntry,
  type TaskRow,
} from "@assistant/db";
import type { BatchProvider } from "@assistant/providers";
import { BatchApplyFailure } from "./applyProjectBreakdown.js";
import { categorizeBatchOutcome } from "./batchOutcome.js";
import { DEFAULT_EVENT_MINUTES } from "./constants.js";
import type { DayShape } from "./dayShape.js";
import { deriveBusyIntervals, placeTasks, type PlacementCandidate } from "./placement.js";

export interface ScheduleGenerationApplyResult {
  generationRunId: string;
  placedCount: number;
  overflowCount: number;
}

const OrderingSchema = z.array(z.string().min(1));

/**
 * Requirement 25: the model supplied an ordering only; this is the
 * arithmetic half — busy intervals excluding `proposed` events (Requirement
 * 19: a proposal never counts as busy for a subsequent run), then
 * `placeTasks` (Requirement 18). Ids the model invented, or tasks that
 * became ineligible between submission and now (completed, cancelled, or
 * scheduled by some other path meanwhile), are silently skipped — they
 * were never valid candidates, which is different from overflow (a valid
 * candidate that didn't fit).
 */
export async function applyScheduleGeneration(
  database: Database,
  batchProvider: BatchProvider,
  job: BatchJobRow,
  context: { ownerUserId: string; ownerTimezone: string; dayShape: DayShape },
): Promise<ScheduleGenerationApplyResult> {
  const run = await getGenerationRun(database, job.subjectId);
  if (!run) {
    throw new BatchApplyFailure("generation_run_not_found", job.subjectId);
  }

  const results = await batchProvider.fetchResults(job.providerBatchId);
  const result = results.find((item) => item.customId === job.subjectId);

  if (!result || result.outcome.type !== "succeeded") {
    const category = categorizeBatchOutcome(result);
    await updateBatchJob(database, job.id, { status: "failed", failureCategory: category });
    throw new BatchApplyFailure(category, job.subjectId);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.outcome.text);
  } catch {
    await updateBatchJob(database, job.id, { status: "failed", failureCategory: "invalid_json" });
    throw new BatchApplyFailure("invalid_json", job.subjectId);
  }

  const ordering = OrderingSchema.safeParse(parsed);
  if (!ordering.success) {
    await updateBatchJob(database, job.id, { status: "failed", failureCategory: "invalid_shape" });
    throw new BatchApplyFailure("invalid_shape", job.subjectId);
  }

  const openTasks = await listOpenTasks(database, context.ownerUserId);
  const stillUnscheduled = new Map<string, TaskRow>();
  for (const task of openTasks) {
    const linkedEvents = await listNonCancelledEventsByTaskId(database, task.taskId);
    if (linkedEvents.length === 0) {
      stillUnscheduled.set(task.taskId, task);
    }
  }

  const candidates: PlacementCandidate[] = [];
  for (const taskId of ordering.data) {
    const task = stillUnscheduled.get(taskId);
    if (task) {
      candidates.push({
        id: task.taskId,
        durationMinutes: task.estimatedMinutes,
        deadline: task.deadline ?? undefined,
      });
    }
  }

  const existingEvents = await listEventsInRange(database, {
    userId: context.ownerUserId,
    startInclusive: run.horizonStart,
    endExclusive: run.horizonEnd,
  });
  const busy = deriveBusyIntervals(
    existingEvents.filter((event) => event.status === "planned" || event.status === "completed"),
  );

  const { placements, overflow } = placeTasks(candidates, {
    horizonStart: run.horizonStart,
    horizonEnd: run.horizonEnd,
    dayShape: context.dayShape,
    timezone: context.ownerTimezone,
    busy,
  });

  for (const placement of placements) {
    const task = stillUnscheduled.get(placement.id);
    if (!task) {
      continue;
    }
    await insertEventRow(database, {
      userId: context.ownerUserId,
      title: task.title,
      startsAt: placement.startsAt,
      durationMinutes: task.estimatedMinutes ?? DEFAULT_EVENT_MINUTES,
      status: "proposed",
      taskId: task.taskId,
    });
  }

  const overflowEntries: OverflowEntry[] = overflow.map((entry) => ({
    taskId: entry.id,
    reason: entry.reason,
  }));
  await updateGenerationRun(database, run.id, { placedCount: placements.length, overflow: overflowEntries });
  await updateBatchJob(database, job.id, {
    status: "applied",
    appliedAt: new Date(),
    inputTokens: result.outcome.usage.inputTokens,
    outputTokens: result.outcome.usage.outputTokens,
  });

  return { generationRunId: run.id, placedCount: placements.length, overflowCount: overflow.length };
}
