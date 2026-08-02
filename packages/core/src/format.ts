import { DateTime } from "luxon";

/**
 * Requirement's accessibility rule: dates render unambiguously (weekday,
 * day, month name, year) — never "03/08". Produces e.g.
 * "7:00 PM, Sunday 3 August 2026", matching the spec's UX example. Used by
 * renderers (Stage 5's event_created) — never by a tool, which returns
 * structured JSON, not prose (ARCHITECTURE.md §2).
 */
export function formatDateTime(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date, { zone: timezone }).toFormat("h:mm a, cccc d LLLL yyyy");
}

/**
 * ISO-8601 with the given zone's offset, e.g. "2026-08-03T07:00:00+08:00".
 * Used by chat-loop to stamp the current instant into a turn's outgoing
 * user-message envelope (Requirement 9/10) — never stored, only sent to
 * the model.
 */
export function formatIsoWithZone(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date, { zone: timezone }).toISO() ?? date.toISOString();
}
