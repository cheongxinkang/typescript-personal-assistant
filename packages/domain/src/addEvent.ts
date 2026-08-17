import { z } from "zod";
import { resolveDateExpression, type EventCreatedData } from "@assistant/core";
import { insertEventRow, type Database } from "@assistant/db";
import { findClashes } from "./clash.js";
import { DEFAULT_EVENT_MINUTES, MAX_EVENT_MINUTES } from "./constants.js";
import type { DomainContext } from "./context.js";

/**
 * Bare validation only — no `.describe()` here. Field descriptions are
 * model-facing prompt data (Requirement 31) and are layered on top of this
 * same shape by packages/tools' adapter; this schema is the one source of
 * truth for what's valid, per Requirement 3.
 */
export const addEventInputSchema = z.object({
  title: z.string().min(1, "title must not be empty").max(200),
  dateExpression: z.string().min(1),
  durationMinutes: z.number().int().positive().max(MAX_EVENT_MINUTES).optional(),
});

export type AddEventInput = z.infer<typeof addEventInputSchema>;

/**
 * Requirement 21 (carried over from Phase 1): the backend resolves the date
 * expression, never the model. Requirement 23: returns the row read back
 * after insert, never an echo of `input` — a model that restates a
 * different title can never have that title win over what was stored.
 *
 * Requirement 12: duration is required as of Stage 2's schema widening.
 * When the model omits it, DEFAULT_EVENT_MINUTES is applied here — never as
 * a silent DB column default — and `durationWasDefaulted` is returned so
 * the rendered reply can say so.
 *
 * Requirement 14: an overlap with an existing planned/completed event is
 * written anyway — this only reports what it overlaps, never refuses.
 */
export async function addEvent(
  database: Database,
  input: AddEventInput,
  context: DomainContext,
): Promise<EventCreatedData> {
  const startsAt = resolveDateExpression(input.dateExpression, context.now, context.ownerTimezone);
  const durationWasDefaulted = input.durationMinutes === undefined;
  const durationMinutes = input.durationMinutes ?? DEFAULT_EVENT_MINUTES;

  const clashesWith = await findClashes(database, {
    userId: context.ownerUserId,
    startsAt,
    durationMinutes,
  });

  const row = await insertEventRow(database, {
    userId: context.ownerUserId,
    title: input.title,
    startsAt,
    durationMinutes,
  });

  return {
    eventId: row.eventId,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    durationMinutes: row.durationMinutes,
    durationWasDefaulted,
    clashesWith,
  };
}
