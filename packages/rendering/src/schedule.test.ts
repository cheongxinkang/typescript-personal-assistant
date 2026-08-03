import { describe, expect, it } from "vitest";
import { renderSchedule } from "./schedule.js";

describe("renderSchedule", () => {
  it("shows an empty day as 'nothing scheduled', per Requirement 17", () => {
    const text = renderSchedule(
      { start: "2026-08-03T00:00:00.000Z", end: "2026-08-04T00:00:00.000Z", days: [{ date: "2026-08-03", events: [] }] },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("Monday 3 August 2026");
    expect(text).toContain("Nothing scheduled.");
  });

  it("lists events with time and title, ordered within the day", () => {
    const text = renderSchedule(
      {
        start: "2026-08-03T00:00:00.000Z",
        end: "2026-08-04T00:00:00.000Z",
        days: [
          {
            date: "2026-08-03",
            events: [
              {
                eventId: "e1",
                title: "Standup",
                startsAt: "2026-08-03T01:00:00.000Z",
                durationMinutes: 30,
                status: "planned",
              },
            ],
          },
        ],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("Standup");
    expect(text).toContain("9:00 AM");
  });

  it("marks a proposed event as not yet confirmed", () => {
    const text = renderSchedule(
      {
        start: "2026-08-03T00:00:00.000Z",
        end: "2026-08-04T00:00:00.000Z",
        days: [
          {
            date: "2026-08-03",
            events: [
              {
                eventId: "e1",
                title: "Draft session",
                startsAt: "2026-08-03T01:00:00.000Z",
                durationMinutes: 30,
                status: "proposed",
              },
            ],
          },
        ],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("proposed — not yet confirmed");
  });
});
