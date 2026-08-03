import { formatCalendarDate, formatTime, SCHEDULE_KIND, type ScheduleData } from "@assistant/core";
import type { Renderer, RenderContext } from "./registry.js";

/**
 * Requirement 17: empty days are shown, not omitted — "a gap in the
 * schedule is information." Requirement 22 (accessibility): plain text,
 * one entry per line, never relying on alignment or formatting alone.
 */
export const renderSchedule: Renderer<ScheduleData> = (data: ScheduleData, context: RenderContext) => {
  const dayBlocks = data.days.map((day) => {
    const heading = formatCalendarDate(day.date);
    if (day.events.length === 0) {
      return `${heading}\n  Nothing scheduled.`;
    }
    const lines = day.events.map((event) => {
      const time = formatTime(new Date(event.startsAt), context.timezone);
      const statusNote = event.status === "proposed" ? " (proposed — not yet confirmed)" : "";
      return `  ${time} — ${event.title}${statusNote}`;
    });
    return `${heading}\n${lines.join("\n")}`;
  });

  return dayBlocks.join("\n\n");
};

export { SCHEDULE_KIND };
