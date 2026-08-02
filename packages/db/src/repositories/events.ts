import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { events, eventsCurrent } from "../schema.js";

export type EventRow = typeof events.$inferSelect;

/**
 * Insert-only (ARCHITECTURE.md §4) — there is deliberately no update/delete
 * function here. A status change or edit is a new row sharing `eventId`,
 * added when Stage 5's add_event/set_event_status land. This function
 * exists now so the table and the fold view (below) are provable from
 * Stage 2, even though nothing calls it in production until Stage 5.
 */
export async function insertEventRow(
  database: Database,
  params: {
    eventId?: string;
    userId: string;
    title: string;
    startsAt: Date;
    durationMinutes?: number;
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
