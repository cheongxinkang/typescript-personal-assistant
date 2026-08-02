import { describe, expect, it } from "vitest";
import { renderEventCreated } from "./eventCreated.js";

describe("renderEventCreated", () => {
  it("matches the spec's UX example shape", () => {
    const text = renderEventCreated(
      {
        eventId: "e1",
        title: "Dinner with Cheryl",
        startsAt: "2026-08-02T23:00:00.000Z", // 2026-08-03T07:00 SGT
        durationMinutes: null,
      },
      { timezone: "Asia/Singapore" },
    );

    expect(text).toBe("Dinner with Cheryl — 7:00 AM, Monday 3 August 2026 — added to your schedule.");
  });

  it("uses the stored title, not anything else", () => {
    const text = renderEventCreated(
      { eventId: "e1", title: "Stored Title", startsAt: "2026-08-02T23:00:00.000Z", durationMinutes: null },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("Stored Title");
  });
});
