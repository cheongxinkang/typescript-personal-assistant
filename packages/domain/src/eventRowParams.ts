import { insertEventRow, type EventRow } from "@assistant/db";

/**
 * Shared by every domain function that appends a carried-forward event row
 * (updateEvent's four actions, confirmSchedule's promotion) — converts a
 * folded row's nullable columns into the `undefined`-shaped params
 * `insertEventRow` expects.
 */
export function toEventInsertParams(
  row: Omit<EventRow, "rowId" | "createdAt">,
): Parameters<typeof insertEventRow>[1] {
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
