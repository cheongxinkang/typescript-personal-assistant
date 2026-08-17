import { z } from "zod";
import type { GenerationSubmittedData } from "@assistant/core";
import {
  insertBatchJob,
  insertGenerationRun,
  listNonCancelledEventsByTaskId,
  listOpenTasks,
  type Database,
  type TaskRow,
} from "@assistant/db";
import { loadScheduleGenerationSystemPrompt } from "@assistant/prompts";
import type { BatchProvider } from "@assistant/providers";
import { GENERATION_HORIZON_DAYS } from "./constants.js";
import type { DomainContext } from "./context.js";

export const generateScheduleInputSchema = z.object({
  horizonDays: z.number().int().positive().max(90).optional(),
});

export type GenerateScheduleInput = z.infer<typeof generateScheduleInputSchema>;

export interface GenerateScheduleDependencies {
  database: Database;
  batchProvider: BatchProvider;
}

function buildOrderingPrompt(candidates: readonly TaskRow[]): string {
  const lines = candidates.map((task) => {
    const deadline = task.deadline ? `, deadline ${task.deadline.toISOString()}` : "";
    const estimate = task.estimatedMinutes ? `, ~${task.estimatedMinutes} min` : "";
    return `- id: ${task.taskId} | ${task.title}${deadline}${estimate}`;
  });
  return `Tasks:\n${lines.join("\n")}`;
}

/**
 * Requirement 25: the model is asked for an ordering only — never a slot,
 * a day, or a duration. Requirement 20: the candidate set is open tasks
 * with **no** non-cancelled event already referencing them, computed here
 * from two reads rather than a stored flag.
 */
export async function generateSchedule(
  deps: GenerateScheduleDependencies,
  input: GenerateScheduleInput,
  context: DomainContext,
): Promise<GenerationSubmittedData> {
  const horizonStart = context.now;
  const horizonDays = input.horizonDays ?? GENERATION_HORIZON_DAYS;
  const horizonEnd = new Date(horizonStart.getTime() + horizonDays * 24 * 60 * 60_000);

  const openTasks = await listOpenTasks(deps.database, context.ownerUserId);
  const candidates: TaskRow[] = [];
  for (const task of openTasks) {
    const linkedEvents = await listNonCancelledEventsByTaskId(deps.database, task.taskId);
    if (linkedEvents.length === 0) {
      candidates.push(task);
    }
  }

  const run = await insertGenerationRun(deps.database, {
    userId: context.ownerUserId,
    horizonStart,
    horizonEnd,
    placedCount: 0,
    overflow: [],
  });

  if (candidates.length === 0) {
    // Nothing to order — the run is already final; no batch to submit.
    return {
      generationRunId: run.id,
      horizonStart: horizonStart.toISOString(),
      horizonEnd: horizonEnd.toISOString(),
      submitted: false,
    };
  }

  const submission = await deps.batchProvider.submit([
    {
      customId: run.id,
      systemPrompt: loadScheduleGenerationSystemPrompt(),
      messages: [{ role: "user", content: buildOrderingPrompt(candidates) }],
    },
  ]);

  await insertBatchJob(deps.database, {
    kind: "schedule_generation",
    subjectId: run.id,
    providerBatchId: submission.providerBatchId,
  });

  return {
    generationRunId: run.id,
    horizonStart: horizonStart.toISOString(),
    horizonEnd: horizonEnd.toISOString(),
    submitted: true,
  };
}
