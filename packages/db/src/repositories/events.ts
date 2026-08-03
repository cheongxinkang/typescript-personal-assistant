import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { events, eventsCurrent } from "../schema.js";

export type EventRow = typeof events.$inferSelect;

/**
 * Insert-only (ARCHITECTURE.md §4) — there is deliberately no update/delete
 * function here. A status change, move, split, or completion is a new row
 * sharing `eventId`, built via packages/db's carryForward helper by the
 * domain layer (Stage 3), not by enumerating fields here.
 *
 * `durationMinutes` became required in Stage 2 (phase-2-tools.md
 * Requirement 12) — the caller (packages/domain) is responsible for
 * applying DEFAULT_EVENT_MINUTES before calling this; this layer only
 * enforces that some value is always given, matching the NOT NULL column.
 */
export async function insertEventRow(
  database: Database,
  params: {
    eventId?: string;
    userId: string;
    title: string;
    startsAt: Date;
    durationMinutes: number;
    status?: EventRow["status"];
    taskId?: string;
    parentEventId?: string;
    partIndex?: number;
    movedFromEventId?: string;
    actualMinutes?: number;
    sourceMessageId?: string;
  },
): Promise<EventRow> {
  const [row] = await database.db
    .insert(events)
    .values({
      eventId: params.eventId,
      userId: params.userId,
      title: params.title,
      startsAt: params.startsAt,
      durationMinutes: params.durationMinutes,
      status: params.status,
      taskId: params.taskId,
      parentEventId: params.parentEventId,
      partIndex: params.partIndex,
      movedFromEventId: params.movedFromEventId,
      actualMinutes: params.actualMinutes,
      sourceMessageId: params.sourceMessageId,
    })
    .returning();

  if (!row) {
    throw new Error("Insert did not return a row.");
  }
  return row;
}

/** Every read goes through the fold view — never the base table directly. */
export async function getCurrentEvent(
  database: Database,
  eventId: string,
): Promise<EventRow | undefined> {
  const [row] = await database.db
    .select()
    .from(eventsCurrent)
    .where(eq(eventsCurrent.eventId, eventId))
    .limit(1);
  return row;
}
