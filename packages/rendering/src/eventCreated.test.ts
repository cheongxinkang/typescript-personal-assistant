import { describe, expect, it } from "vitest";
import { renderEventCreated } from "./eventCreated.js";

describe("renderEventCreated", () => {
  it("matches the spec's UX example shape", () => {
    const text = renderEventCreated(
      {
        eventId: "e1",
        title: "Dinner with Cheryl",
        startsAt: "2026-08-02T23:00:00.000Z", // 2026-08-03T07:00 SGT
        durationMinutes: 60,
        durationWasDefaulted: false,
        clashesWith: [],
      },
      { timezone: "Asia/Singapore" },
    );

    expect(text).toBe("Dinner with Cheryl — 7:00 AM, Monday 3 August 2026 — added to your schedule.");
  });

  it("uses the stored title, not anything else", () => {
    const text = renderEventCreated(
      {
        eventId: "e1",
        title: "Stored Title",
        startsAt: "2026-08-02T23:00:00.000Z",
        durationMinutes: 60,
        durationWasDefaulted: false,
        clashesWith: [],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("Stored Title");
  });

  it("states the default was applied, per phase-2-tools.md Requirement 12", () => {
    const text = renderEventCreated(
      {
        eventId: "e1",
        title: "Standup",
        startsAt: "2026-08-02T23:00:00.000Z",
        durationMinutes: 30,
        durationWasDefaulted: true,
        clashesWith: [],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("defaulted to 30 min");
  });

  it("names a single clash, per Requirement 14 — written anyway, not refused", () => {
    const text = renderEventCreated(
      {
        eventId: "e1",
        title: "Dentist",
        startsAt: "2026-08-02T23:00:00.000Z",
        durationMinutes: 30,
        durationWasDefaulted: false,
        clashesWith: ["other-event-id"],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("added to your schedule.");
    expect(text).toContain("overlaps another event");
  });

  it("pluralizes for multiple clashes", () => {
    const text = renderEventCreated(
      {
        eventId: "e1",
        title: "Dentist",
        startsAt: "2026-08-02T23:00:00.000Z",
        durationMinutes: 30,
        durationWasDefaulted: false,
        clashesWith: ["e-a", "e-b"],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("overlaps 2 other events");
  });
});
