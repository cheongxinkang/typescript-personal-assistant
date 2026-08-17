import { z } from "zod";
import { resolveDateExpression, type EventUpdatedData } from "@assistant/core";
import { carryForward, getCurrentEvent, insertEventRow, type Database, type EventRow } from "@assistant/db";
import { findClashes } from "./clash.js";
import type { DomainContext } from "./context.js";
import { NotFoundError } from "./errors.js";

export const updateEventInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("complete"),
    eventId: z.string().min(1),
    actualMinutes: z.number().int().positive().optional(),
  }),
  z.object({ action: z.literal("cancel"), eventId: z.string().min(1) }),
  z.object({ action: z.literal("move"), eventId: z.string().min(1), dateExpression: z.string().min(1) }),
  z.object({
    action: z.literal("split"),
    eventId: z.string().min(1),
    completedMinutes: z.number().int().positive(),
  }),
]);

export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;

function toInsertParams(row: Omit<EventRow, "rowId" | "createdAt">): Parameters<typeof insertEventRow>[1] {
  return {
    eventId: row.eventId,
    userId: row.userId,
    title: row.title,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    status: row.status,
    taskId: row.taskId ?? undefined,
    parentEventId: row.parentEventId ?? undefined,
    partIndex: row.partIndex ?? undefined,
    movedFromEventId: row.movedFromEventId ?? undefined,
    actualMinutes: row.actualMinutes ?? undefined,
    sourceMessageId: row.sourceMessageId ?? undefined,
  };
}

function toEventUpdatedData(
  row: EventRow,
  action: EventUpdatedData["action"],
  clashesWith: string[],
  remainderMinutes: number | null,
): EventUpdatedData {
  return {
    action,
    eventId: row.eventId,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    durationMinutes: row.durationMinutes,
    status: row.status,
    actualMinutes: row.actualMinutes,
    clashesWith,
    remainderMinutes,
    movedFromEventId: row.movedFromEventId,
  };
}

/**
 * Requirement 8 (move/cancel/complete lifecycle), 15 (split), 16
 * (completion feedback). One operation with a discriminated `action`
 * (Requirement 28) rather than four tools — every branch appends a new row
 * sharing `eventId` via carryForward (Requirement 7), never an UPDATE.
 */
export async function updateEvent(
  database: Database,
  input: UpdateEventInput,
  context: DomainContext,
): Promise<EventUpdatedData> {
  const current = await getCurrentEvent(database, input.eventId);
  if (!current) {
    throw new NotFoundError("event", input.eventId);
  }

  if (input.action === "complete") {
    // Idempotent — completing an already-completed event is a no-op read,
    // never a second revision (Failure/edge-case table).
    if (current.status === "completed") {
      return toEventUpdatedData(current, "complete", [], null);
    }
    const carried = carryForward(current, {
      status: "completed",
      // Requirement 16: actualMinutes is recorded alongside the untouched
      // planned durationMinutes — never reconciled by overwriting it.
      actualMinutes: input.actualMinutes ?? current.durationMinutes,
    });
    const row = await insertEventRow(database, toInsertParams(carried));
    return toEventUpdatedData(row, "complete", [], null);
  }

  if (input.action === "cancel") {
    if (current.status === "cancelled") {
      return toEventUpdatedData(current, "cancel", [], null);
    }
    const carried = carryForward(current, { status: "cancelled" });
    const row = await insertEventRow(database, toInsertParams(carried));
    return toEventUpdatedData(row, "cancel", [], null);
  }

  if (input.action === "move") {
    const startsAt = resolveDateExpression(input.dateExpression, context.now, context.ownerTimezone);

    // Requirement 8: TWO rows — the original marked rescheduled (freeing
    // its slot), and a new event_id at the new time carrying
    // movedFromEventId. A single row at a new time would hide that a move
    // happened at all, which plan-versus-actual measurement needs.
    await insertEventRow(database, toInsertParams(carryForward(current, { status: "rescheduled" })));

    const clashesWith = await findClashes(database, {
      userId: context.ownerUserId,
      startsAt,
      durationMinutes: current.durationMinutes,
    });

    const newRow = await insertEventRow(database, {
      userId: context.ownerUserId,
      title: current.title,
      startsAt,
      durationMinutes: current.durationMinutes,
      status: "planned",
      taskId: current.taskId ?? undefined,
      movedFromEventId: current.eventId,
    });

    return toEventUpdatedData(newRow, "move", clashesWith, null);
  }

  // action === "split"
  if (input.completedMinutes >= current.durationMinutes) {
    // Edge case: a completed portion at or beyond the whole event's
    // duration is just a completion — no remainder to create or report.
    const carried = carryForward(current, {
      status: "completed",
      actualMinutes: current.durationMinutes,
    });
    const row = await insertEventRow(database, toInsertParams(carried));
    return toEventUpdatedData(row, "split", [], null);
  }

  const remainderMinutes = current.durationMinutes - input.completedMinutes;
  const carried = carryForward(current, {
    status: "completed",
    durationMinutes: input.completedMinutes,
    actualMinutes: input.completedMinutes,
  });
  const row = await insertEventRow(database, toInsertParams(carried));
  // No placement function exists yet (Stage 4 adds it) — the remainder is
  // reported, never written as an unscheduled row: events.startsAt is
  // NOT NULL (Stage 2), so there is no way to store "not yet scheduled."
  return toEventUpdatedData(row, "split", [], remainderMinutes);
}
