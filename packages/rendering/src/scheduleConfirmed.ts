import { SCHEDULE_CONFIRMED_KIND, type ScheduleConfirmedData } from "@assistant/core";
import type { Renderer } from "./registry.js";

export const renderScheduleConfirmed: Renderer<ScheduleConfirmedData> = (data: ScheduleConfirmedData) => {
  const count = data.confirmedEventIds.length;
  if (count === 0) {
    return "Nothing to confirm — that proposal had no events left to promote.";
  }
  return `Confirmed — ${count} ${count === 1 ? "event is" : "events are"} now on your schedule.`;
};

export { SCHEDULE_CONFIRMED_KIND };
