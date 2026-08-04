import { DateTime } from "luxon";
import { formatDateTime, resolveDateExpression } from "@assistant/core";
import {
  findEventsForOwnerByTitle,
  findTasksForOwnerByTitle,
  getCurrentEvent,
  getCurrentTask,
  type Database,
  type EventRow,
  type TaskRow,
} from "@assistant/db";
import { AmbiguousReferenceError, NotFoundError } from "./errors.js";

/** Either an id (fast, precise path) or a title to search for — never both, never neither. */
export interface ByIdOrTitle {
  id?: string;
  title?: string;
  /** Only meaningful alongside `title` — narrows the search to one calendar day. */
  dateHint?: string;
}

function dayRange(dateHint: string, now: Date, timezone: string): { startInclusive: Date; endExclusive: Date } {
  const resolved = resolveDateExpression(dateHint, now, timezone);
  const startInclusive = DateTime.fromJSDate(resolved, { zone: timezone }).startOf("day");
  return { startInclusive: startInclusive.toJSDate(), endExclusive: startInclusive.plus({ days: 1 }).toJSDate() };
}

/**
 * Resolves `update_event`'s target, added because the tool's original
 * "look up the id from a prior get_schedule result" instruction was
 * structurally unreachable: the agent loop ends a turn at its first
 * successful tool call (no narration round-trip, ARCHITECTURE.md §2), so a
 * lookup call and a write call could never happen in the same turn, and no
 * renderer ever surfaces a raw id for a later turn to reuse either. This
 * lets the tool resolve a name directly, in one call.
 */
export async function resolveEventReference(
  database: Database,
  userId: string,
  ref: ByIdOrTitle,
  now: Date,
  timezone: string,
): Promise<EventRow> {
  if (ref.id) {
    const row = await getCurrentEvent(database, ref.id);
    if (!row) {
      throw new NotFoundError("event", ref.id);
    }
    return row;
  }

  const title = ref.title;
  if (!title) {
    throw new Error("resolveEventReference requires either an id or a title.");
  }

  const range = ref.dateHint ? dayRange(ref.dateHint, now, timezone) : undefined;
  const candidates = await findEventsForOwnerByTitle(database, userId, title, range);

  if (candidates.length === 0) {
    throw new NotFoundError("event", title);
  }
  if (candidates.length > 1) {
    throw new AmbiguousReferenceError(
      "event",
      title,
      candidates.map((c) => `"${c.title}" at ${formatDateTime(c.startsAt, timezone)}`),
    );
  }
  return candidates[0]!;
}

/** Same shape and reasoning as `resolveEventReference`, for `update_task`. */
export async function resolveTaskReference(
  database: Database,
  userId: string,
  ref: ByIdOrTitle,
  timezone: string,
): Promise<TaskRow> {
  if (ref.id) {
    const row = await getCurrentTask(database, ref.id);
    if (!row) {
      throw new NotFoundError("task", ref.id);
    }
    return row;
  }

  const title = ref.title;
  if (!title) {
    throw new Error("resolveTaskReference requires either an id or a title.");
  }

  const candidates = await findTasksForOwnerByTitle(database, userId, title);

  if (candidates.length === 0) {
    throw new NotFoundError("task", title);
  }
  if (candidates.length > 1) {
    throw new AmbiguousReferenceError(
      "task",
      title,
      candidates.map((c) => `"${c.title}"${c.deadline ? ` (due ${formatDateTime(c.deadline, timezone)})` : ""}`),
    );
  }
  return candidates[0]!;
}
