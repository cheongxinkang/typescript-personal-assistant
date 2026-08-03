import { describe, expect, it } from "vitest";
import { renderEventUpdated } from "./eventUpdated.js";

const base = {
  eventId: "e1",
  title: "Migrate posts",
  startsAt: "2026-08-03T01:00:00.000Z",
  durationMinutes: 60,
  clashesWith: [] as string[],
  remainderMinutes: null,
  remainderEventId: null,
  remainderStartsAt: null,
  movedFromEventId: null,
};

describe("renderEventUpdated", () => {
  it("names the completed event and actual minutes", () => {
    const text = renderEventUpdated(
      { ...base, action: "complete", status: "completed", actualMinutes: 45 },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toBe('Marked "Migrate posts" complete (45 min).');
  });

  it("names the cancelled event", () => {
    const text = renderEventUpdated(
      { ...base, action: "cancel", status: "cancelled", actualMinutes: null },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toBe("Cancelled: Migrate posts.");
  });

  it("names the moved event's new time, and a clash if any", () => {
    const text = renderEventUpdated(
      { ...base, action: "move", status: "planned", actualMinutes: null, clashesWith: ["e2"] },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("Moved");
    expect(text).toContain("overlaps another event");
  });

  it("reports the remainder for a split", () => {
    const text = renderEventUpdated(
      { ...base, action: "split", status: "completed", actualMinutes: 30, remainderMinutes: 30 },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("30 min");
    expect(text).toContain("not yet scheduled");
  });

  it("reports no remainder note when the split had none", () => {
    const text = renderEventUpdated(
      { ...base, action: "split", status: "completed", actualMinutes: 60, remainderMinutes: null },
      { timezone: "Asia/Singapore" },
    );
    expect(text).not.toContain("remaining");
  });

  it("reports the remainder's scheduled time when placement succeeded (Stage 4)", () => {
    const text = renderEventUpdated(
      {
        ...base,
        action: "split",
        status: "completed",
        actualMinutes: 30,
        remainderMinutes: null,
        remainderEventId: "e-remainder",
        remainderStartsAt: "2026-08-04T01:00:00.000Z",
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("Remaining time scheduled for");
    expect(text).not.toContain("not yet scheduled");
  });
});
