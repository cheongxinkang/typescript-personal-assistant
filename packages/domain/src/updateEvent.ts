import { z } from "zod";
import { resolveDateExpression, type EventUpdatedData } from "@assistant/core";
import {
  carryForward,
  getCurrentEvent,
  insertEventRow,
  listEventsInRange,
  type Database,
  type EventRow,
} from "@assistant/db";
import { findClashes } from "./clash.js";
import { GENERATION_HORIZON_DAYS } from "./constants.js";
import type { DomainContext } from "./context.js";
import { NotFoundError } from "./errors.js";
import { toEventInsertParams } from "./eventRowParams.js";
import { deriveBusyIntervals, placeTasks } from "./placement.js";

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

function toEventUpdatedData(
  row: EventRow,
  action: EventUpdatedData["action"],
  clashesWith: string[],
  remainderMinutes: number | null,
  remainder: { eventId: string; startsAt: Date } | null = null,
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
    remainderEventId: remainder?.eventId ?? null,
    remainderStartsAt: remainder?.startsAt.toISOString() ?? null,
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
    const row = await insertEventRow(database, toEventInsertParams(carried));
    return toEventUpdatedData(row, "complete", [], null);
  }

  if (input.action === "cancel") {
    if (current.status === "cancelled") {
      return toEventUpdatedData(current, "cancel", [], null);
    }
    const carried = carryForward(current, { status: "cancelled" });
    const row = await insertEventRow(database, toEventInsertParams(carried));
    return toEventUpdatedData(row, "cancel", [], null);
  }

  if (input.action === "move") {
    const startsAt = resolveDateExpression(input.dateExpression, context.now, context.ownerTimezone);

    // Requirement 8: TWO rows — the original marked rescheduled (freeing
    // its slot), and a new event_id at the new time carrying
    // movedFromEventId. A single row at a new time would hide that a move
    // happened at all, which plan-versus-actual measurement needs.
    await insertEventRow(database, toEventInsertParams(carryForward(current, { status: "rescheduled" })));

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
    const row = await insertEventRow(database, toEventInsertParams(carried));
    return toEventUpdatedData(row, "split", [], null);
  }

  const remainderMinutes = current.durationMinutes - input.completedMinutes;
  const carried = carryForward(current, {
    status: "completed",
    durationMinutes: input.completedMinutes,
    actualMinutes: input.completedMinutes,
  });
  const row = await insertEventRow(database, toEventInsertParams(carried));

  // Requirement 15: place the remainder into the next free slot, now that
  // Stage 4 has a placement function. `context.dayShape` is optional
  // (tests may omit it to exercise the report-only fallback deliberately;
  // apps/server always supplies it in production) — without it, or if no
  // slot exists in the horizon, the remainder is reported as a bare number
  // rather than written as an unscheduled row (events.startsAt is NOT
  // NULL, so there is no way to store "not yet scheduled").
  if (context.dayShape) {
    const remainderStart = new Date(
      Math.max(current.startsAt.getTime() + current.durationMinutes * 60_000, context.now.getTime()),
    );
    const horizonEnd = new Date(context.now.getTime() + GENERATION_HORIZON_DAYS * 24 * 60 * 60_000);

    const existingEvents = await listEventsInRange(database, {
      userId: context.ownerUserId,
      startInclusive: remainderStart,
      endExclusive: horizonEnd,
    });
    const busy = deriveBusyIntervals(
      existingEvents.filter((event) => event.status === "planned" || event.status === "completed"),
    );

    const { placements } = placeTasks([{ id: "remainder", durationMinutes: remainderMinutes }], {
      horizonStart: remainderStart,
      horizonEnd,
      dayShape: context.dayShape,
      timezone: context.ownerTimezone,
      busy,
    });
    const placement = placements[0];

    if (placement) {
      const remainderRow = await insertEventRow(database, {
        userId: context.ownerUserId,
        title: current.title,
        startsAt: placement.startsAt,
        durationMinutes: remainderMinutes,
        status: "planned",
        taskId: current.taskId ?? undefined,
        parentEventId: current.eventId,
        partIndex: 2,
      });
      return toEventUpdatedData(row, "split", [], null, {
        eventId: remainderRow.eventId,
        startsAt: remainderRow.startsAt,
      });
    }
  }

  return toEventUpdatedData(row, "split", [], remainderMinutes, null);
}
