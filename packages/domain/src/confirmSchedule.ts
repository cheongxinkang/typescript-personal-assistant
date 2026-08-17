import { z } from "zod";
import type { ScheduleConfirmedData } from "@assistant/core";
import { carryForward, getGenerationRun, insertEventRow, listEventsInRange, type Database } from "@assistant/db";
import type { DomainContext } from "./context.js";
import { NotFoundError } from "./errors.js";
import { toEventInsertParams } from "./eventRowParams.js";

export const confirmScheduleInputSchema = z.object({
  generationRunId: z.string().min(1),
});

export type ConfirmScheduleInput = z.infer<typeof confirmScheduleInputSchema>;

/**
 * Requirement 19: proposals are promoted in one operation, each becoming a
 * new row (never an UPDATE) — a run's proposed events are identified by
 * status `proposed` within its own horizon, since there is no separate
 * events.generationRunId column (the horizon range is precise enough:
 * only generation ever sets `proposed`).
 */
export async function confirmSchedule(
  database: Database,
  input: ConfirmScheduleInput,
  context: DomainContext,
): Promise<ScheduleConfirmedData> {
  const run = await getGenerationRun(database, input.generationRunId);
  if (!run) {
    throw new NotFoundError("generationRun", input.generationRunId);
  }

  const events = await listEventsInRange(database, {
    userId: context.ownerUserId,
    startInclusive: run.horizonStart,
    endExclusive: run.horizonEnd,
  });
  const proposed = events.filter((event) => event.status === "proposed");

  const confirmedEventIds: string[] = [];
  for (const event of proposed) {
    const carried = carryForward(event, { status: "planned" });
    const row = await insertEventRow(database, toEventInsertParams(carried));
    confirmedEventIds.push(row.eventId);
  }

  return { confirmedEventIds };
}
