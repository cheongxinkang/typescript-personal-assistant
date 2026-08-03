import { listEventsInRange, type Database } from "@assistant/db";
import { MAX_EVENT_MINUTES } from "./constants.js";

/**
 * Requirement 14: creating or moving an event to a slot that overlaps an
 * existing `planned`/`completed` event succeeds — this just names what it
 * overlaps. `proposed` events are deliberately excluded (mirrors
 * Requirement 19's "a proposal doesn't count as busy", extended here so a
 * not-yet-confirmed suggestion never blocks or gets reported as a real
 * clash) and so are `cancelled`/`rescheduled` ones (already excluded by
 * listEventsInRange's default).
 *
 * The query window looks back MAX_EVENT_MINUTES before `startsAt` — the
 * longest any existing event can run — which is exactly far enough that no
 * true overlap can start outside the window and be missed.
 */
export async function findClashes(
  database: Database,
  params: {
    userId: string;
    startsAt: Date;
    durationMinutes: number;
    excludeEventId?: string;
  },
): Promise<string[]> {
  const endsAt = new Date(params.startsAt.getTime() + params.durationMinutes * 60_000);
  const lookbackStart = new Date(params.startsAt.getTime() - MAX_EVENT_MINUTES * 60_000);

  const candidates = await listEventsInRange(database, {
    userId: params.userId,
    startInclusive: lookbackStart,
    endExclusive: endsAt,
  });

  return candidates
    .filter((event) => event.eventId !== params.excludeEventId)
    .filter((event) => event.status === "planned" || event.status === "completed")
    .filter((event) => {
      const eventEndsAt = event.startsAt.getTime() + event.durationMinutes * 60_000;
      return event.startsAt.getTime() < endsAt.getTime() && eventEndsAt > params.startsAt.getTime();
    })
    .map((event) => event.eventId);
}
