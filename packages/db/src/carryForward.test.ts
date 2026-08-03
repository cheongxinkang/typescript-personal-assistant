import { describe, expect, it } from "vitest";
import { carryForward } from "./carryForward.js";

describe("carryForward", () => {
  it("strips rowId and createdAt, carries every other field, applies overrides", () => {
    const current = {
      rowId: "row-1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      eventId: "event-1",
      title: "Standup",
      durationMinutes: 30,
    };

    const next = carryForward(current, { title: "Standup (renamed)" });

    expect(next).toEqual({
      eventId: "event-1",
      title: "Standup (renamed)",
      durationMinutes: 30,
    });
    expect(next).not.toHaveProperty("rowId");
    expect(next).not.toHaveProperty("createdAt");
  });

  /**
   * The pinning test Requirement 7 asks for: a field added to the row type
   * *after* this function was written must still carry forward without
   * carryForward.ts itself changing. `parentEventId` here stands in for any
   * future column — the point is that this test, not the implementation,
   * is what has to change when a real column like it is added to schema.ts.
   */
  it("carries a field added to the row shape after this function was written", () => {
    const current = {
      rowId: "row-1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      eventId: "event-1",
      title: "Standup",
      parentEventId: "event-0", // stands in for a column added later
    };

    const next = carryForward(current, { title: "Standup (split)" });

    expect(next.parentEventId).toBe("event-0");
  });
});
