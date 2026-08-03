import { EVENT_CREATED_KIND, formatDateTime, type EventCreatedData } from "@assistant/core";
import type { Renderer, RenderContext } from "./registry.js";

/**
 * Matches the spec's UX example: "Dinner with Cheryl — 7:00 PM, Sunday 3
 * August 2026 — added to your schedule." Built entirely from the stored
 * row's own fields (Requirement 23) — this is a template, not model prose
 * (Requirement 14: a tool-backed turn produces no model prose at all).
 */
export const renderEventCreated: Renderer<EventCreatedData> = (
  data: EventCreatedData,
  context: RenderContext,
) => {
  const when = formatDateTime(new Date(data.startsAt), context.timezone);
  const durationNote = data.durationWasDefaulted
    ? ` (defaulted to ${data.durationMinutes} min — say a duration if that's wrong)`
    : "";
  return `${data.title} — ${when} — added to your schedule.${durationNote}`;
};

export { EVENT_CREATED_KIND };
