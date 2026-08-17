import { EVENT_UPDATED_KIND, formatDateTime, type EventUpdatedData } from "@assistant/core";
import type { Renderer, RenderContext } from "./registry.js";

function clashNote(data: EventUpdatedData): string {
  if (data.clashesWith.length === 0) {
    return "";
  }
  const count = data.clashesWith.length;
  return ` Heads up — this overlaps ${count === 1 ? "another event" : `${count} other events`} already on your schedule.`;
}

/**
 * One renderer for update_event's four actions (Requirement 8, 15, 16) —
 * mirrors EventUpdatedData being one shape for all of them.
 */
export const renderEventUpdated: Renderer<EventUpdatedData> = (
  data: EventUpdatedData,
  context: RenderContext,
) => {
  const when = formatDateTime(new Date(data.startsAt), context.timezone);

  if (data.action === "complete") {
    return `Marked "${data.title}" complete (${data.actualMinutes} min).`;
  }
  if (data.action === "cancel") {
    return `Cancelled: ${data.title}.`;
  }
  if (data.action === "move") {
    return `Moved "${data.title}" to ${when}.${clashNote(data)}`;
  }
  // split
  let remainderNote = "";
  if (data.remainderEventId && data.remainderStartsAt) {
    const remainderWhen = formatDateTime(new Date(data.remainderStartsAt), context.timezone);
    remainderNote = ` Remaining time scheduled for ${remainderWhen}.`;
  } else if (data.remainderMinutes !== null) {
    remainderNote = ` ${data.remainderMinutes} min remaining — not yet scheduled.`;
  }
  return `Marked ${data.actualMinutes} min of "${data.title}" complete.${remainderNote}`;
};

export { EVENT_UPDATED_KIND };
