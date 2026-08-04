import { and, asc, eq, gte, ilike, inArray, lt, notInArray } from "drizzle-orm";
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

/**
 * Requirement 17 (get_schedule) and Requirement 14 (clash detection) both
 * read a folded range of events; this is the one query both build on.
 * `cancelled`/`rescheduled` are excluded by default (Requirement 17) since
 * a superseded-by-reschedule row is exactly as stale as a cancelled one —
 * `includeCancelled` widens both together, there being no separate flag for
 * "include superseded reschedules" in the spec.
 */
export async function listEventsInRange(
  database: Database,
  params: {
    userId: string;
    startInclusive: Date;
    endExclusive: Date;
    includeCancelled?: boolean;
  },
): Promise<EventRow[]> {
  const conditions = [
    eq(eventsCurrent.userId, params.userId),
    gte(eventsCurrent.startsAt, params.startInclusive),
    lt(eventsCurrent.startsAt, params.endExclusive),
  ];
  if (!params.includeCancelled) {
    conditions.push(notInArray(eventsCurrent.status, ["cancelled", "rescheduled"]));
  }

  return database.db
    .select()
    .from(eventsCurrent)
    .where(and(...conditions))
    .orderBy(eventsCurrent.startsAt);
}

/**
 * Every one of the owner's events, folded, every status — no range, no
 * status filter. phase_2a-db-visibility.md Requirement 4 (all rows, not
 * just active ones) and Requirement 7 (defensive `limit`); distinct from
 * `listEventsInRange`, which every tool-facing read uses instead and which
 * this deliberately does not touch.
 */
export async function listAllEventsForOwner(database: Database, userId: string, limit: number): Promise<EventRow[]> {
  return database.db
    .select()
    .from(eventsCurrent)
    .where(eq(eventsCurrent.userId, userId))
    .orderBy(asc(eventsCurrent.startsAt))
    .limit(limit);
}

/**
 * Case-insensitive substring match on title, scoped to **actionable**
 * statuses only (`planned`/`proposed` — a `completed`/`cancelled`/
 * `rescheduled` row is stale history, not something you'd naturally
 * reference by name to act on again), optionally narrowed to a single
 * calendar day. Added to resolve `update_event`'s `title` reference — see
 * `packages/domain/src/resolveReference.ts`.
 */
export async function findEventsForOwnerByTitle(
  database: Database,
  userId: string,
  searchTerm: string,
  dayRange?: { startInclusive: Date; endExclusive: Date },
): Promise<EventRow[]> {
  const conditions = [
    eq(eventsCurrent.userId, userId),
    inArray(eventsCurrent.status, ["planned", "proposed"]),
    ilike(eventsCurrent.title, `%${searchTerm}%`),
  ];
  if (dayRange) {
    conditions.push(gte(eventsCurrent.startsAt, dayRange.startInclusive));
    conditions.push(lt(eventsCurrent.startsAt, dayRange.endExclusive));
  }

  return database.db
    .select()
    .from(eventsCurrent)
    .where(and(...conditions))
    .orderBy(eventsCurrent.startsAt);
}

/**
 * Requirement 20: a task is "scheduled" iff a folded, non-cancelled event
 * references its `taskId` — computed here, never stored. Used by
 * update_task (to report orphaned events on completion/cancellation) and,
 * from Stage 6, by generation to skip tasks that already have one.
 */
export async function listNonCancelledEventsByTaskId(
  database: Database,
  taskId: string,
): Promise<EventRow[]> {
  return database.db
    .select()
    .from(eventsCurrent)
    .where(and(eq(eventsCurrent.taskId, taskId), notInArray(eventsCurrent.status, ["cancelled", "rescheduled"])));
}
