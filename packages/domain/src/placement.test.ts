import { describe, expect, it } from "vitest";
import type { DayShape } from "./dayShape.js";
import { deriveBusyIntervals, mergeIntervals, placeTasks } from "./placement.js";

const WEEKDAY_9_TO_5: DayShape = {
  monday: { start: "09:00", end: "17:00" },
  tuesday: { start: "09:00", end: "17:00" },
  wednesday: { start: "09:00", end: "17:00" },
  thursday: { start: "09:00", end: "17:00" },
  friday: { start: "09:00", end: "17:00" },
  // No weekend entries — Saturday/Sunday are fully unschedulable.
};

describe("mergeIntervals", () => {
  it("combines overlapping and touching intervals", () => {
    const merged = mergeIntervals([
      { start: new Date("2026-08-03T09:00:00Z"), end: new Date("2026-08-03T10:00:00Z") },
      { start: new Date("2026-08-03T10:00:00Z"), end: new Date("2026-08-03T11:00:00Z") }, // touching
      { start: new Date("2026-08-03T10:30:00Z"), end: new Date("2026-08-03T12:00:00Z") }, // overlapping
      { start: new Date("2026-08-03T14:00:00Z"), end: new Date("2026-08-03T15:00:00Z") }, // separate
    ]);
    expect(merged).toEqual([
      { start: new Date("2026-08-03T09:00:00Z"), end: new Date("2026-08-03T12:00:00Z") },
      { start: new Date("2026-08-03T14:00:00Z"), end: new Date("2026-08-03T15:00:00Z") },
    ]);
  });
});

describe("deriveBusyIntervals", () => {
  it("converts events to intervals and merges overlaps", () => {
    const intervals = deriveBusyIntervals([
      { startsAt: new Date("2026-08-03T09:00:00Z"), durationMinutes: 60 },
      { startsAt: new Date("2026-08-03T09:30:00Z"), durationMinutes: 30 },
    ]);
    expect(intervals).toEqual([
      { start: new Date("2026-08-03T09:00:00Z"), end: new Date("2026-08-03T10:00:00Z") },
    ]);
  });
});

describe("placeTasks", () => {
  it("places a task into the day shape's window, forward from the horizon start", () => {
    const result = placeTasks(
      [{ id: "t1", durationMinutes: 60 }],
      {
        horizonStart: new Date("2026-08-03T00:00:00Z"), // Monday 08:00 SGT
        horizonEnd: new Date("2026-08-10T00:00:00Z"),
        dayShape: WEEKDAY_9_TO_5,
        timezone: "Asia/Singapore",
        busy: [],
      },
    );
    expect(result.overflow).toEqual([]);
    expect(result.placements).toEqual([{ id: "t1", startsAt: new Date("2026-08-03T01:00:00Z") }]); // 09:00 SGT
  });

  it("skips a fully unschedulable weekday (Requirement 18's day shape)", () => {
    // Horizon starts Saturday — no window that day or Sunday, first slot is Monday.
    const result = placeTasks(
      [{ id: "t1", durationMinutes: 60 }],
      {
        horizonStart: new Date("2026-08-08T01:00:00Z"), // Saturday 09:00 SGT
        horizonEnd: new Date("2026-08-14T00:00:00Z"),
        dayShape: WEEKDAY_9_TO_5,
        timezone: "Asia/Singapore",
        busy: [],
      },
    );
    expect(result.placements).toEqual([{ id: "t1", startsAt: new Date("2026-08-10T01:00:00Z") }]); // Monday 09:00 SGT
  });

  it("never overlaps a busy interval and never backfills an earlier gap", () => {
    const result = placeTasks(
      [
        { id: "t1", durationMinutes: 60 },
        { id: "t2", durationMinutes: 30 },
      ],
      {
        horizonStart: new Date("2026-08-03T01:00:00Z"), // Monday 09:00 SGT
        horizonEnd: new Date("2026-08-04T00:00:00Z"),
        dayShape: WEEKDAY_9_TO_5,
        timezone: "Asia/Singapore",
        busy: [],
      },
    );
    // t1 takes 09:00-10:00; t2 must start at or after 10:00, never inside t1's slot,
    // and never in front of it either (cursor only moves forward).
    expect(result.placements[0]).toEqual({ id: "t1", startsAt: new Date("2026-08-03T01:00:00Z") });
    expect(result.placements[1]?.startsAt.getTime()).toBeGreaterThanOrEqual(
      new Date("2026-08-03T02:00:00Z").getTime(),
    );
  });

  it("reports overflow, never truncating, when the horizon has no room left", () => {
    const result = placeTasks(
      [{ id: "t1", durationMinutes: 60 }],
      {
        horizonStart: new Date("2026-08-03T01:00:00Z"),
        horizonEnd: new Date("2026-08-04T00:00:00Z"),
        dayShape: WEEKDAY_9_TO_5,
        timezone: "Asia/Singapore",
        // The entire Monday window is already busy.
        busy: [{ start: new Date("2026-08-03T01:00:00Z"), end: new Date("2026-08-03T09:00:00Z") }],
      },
    );
    expect(result.placements).toEqual([]);
    expect(result.overflow).toEqual([{ id: "t1", reason: "no_free_interval" }]);
  });

  it("reports 'no_estimate' for a task with no duration, never guessing one", () => {
    const result = placeTasks(
      [{ id: "t1", durationMinutes: null }],
      {
        horizonStart: new Date("2026-08-03T01:00:00Z"),
        horizonEnd: new Date("2026-08-10T00:00:00Z"),
        dayShape: WEEKDAY_9_TO_5,
        timezone: "Asia/Singapore",
        busy: [],
      },
    );
    expect(result.placements).toEqual([]);
    expect(result.overflow).toEqual([{ id: "t1", reason: "no_estimate" }]);
  });

  it("reports 'deadline_passed' for a deadline already before the horizon", () => {
    const result = placeTasks(
      [{ id: "t1", durationMinutes: 30, deadline: new Date("2026-08-01T00:00:00Z") }],
      {
        horizonStart: new Date("2026-08-03T01:00:00Z"),
        horizonEnd: new Date("2026-08-10T00:00:00Z"),
        dayShape: WEEKDAY_9_TO_5,
        timezone: "Asia/Singapore",
        busy: [],
      },
    );
    expect(result.overflow).toEqual([{ id: "t1", reason: "deadline_passed" }]);
  });

  it("reports 'dependency_unmet' and does not place a candidate whose in-set dependency overflowed", () => {
    // Reproduces the real bug: a dependency with a past deadline overflows
    // (deadline_passed) and never gets placed — its dependent must overflow
    // too, not get placed as if the dependency succeeded. Candidates are
    // pre-ordered by applyDependencyOrder, so module4 (the dependency)
    // comes first here.
    const result = placeTasks(
      [
        { id: "module4", durationMinutes: 60, deadline: new Date("2026-08-01T00:00:00Z") },
        { id: "mock-exam", durationMinutes: 60, dependsOn: ["module4"] },
      ],
      {
        horizonStart: new Date("2026-08-03T01:00:00Z"),
        horizonEnd: new Date("2026-08-10T00:00:00Z"),
        dayShape: WEEKDAY_9_TO_5,
        timezone: "Asia/Singapore",
        busy: [],
      },
    );
    expect(result.placements).toEqual([]);
    expect(result.overflow).toEqual([
      { id: "module4", reason: "deadline_passed" },
      { id: "mock-exam", reason: "dependency_unmet" },
    ]);
  });

  it("places a dependent once its dependency is actually placed", () => {
    const result = placeTasks(
      [
        { id: "module4", durationMinutes: 60 },
        { id: "mock-exam", durationMinutes: 60, dependsOn: ["module4"] },
      ],
      {
        horizonStart: new Date("2026-08-03T01:00:00Z"), // Monday 09:00 SGT
        horizonEnd: new Date("2026-08-10T00:00:00Z"),
        dayShape: WEEKDAY_9_TO_5,
        timezone: "Asia/Singapore",
        busy: [],
      },
    );
    expect(result.overflow).toEqual([]);
    expect(result.placements.map((p) => p.id)).toEqual(["module4", "mock-exam"]);
    expect(result.placements[1]!.startsAt.getTime()).toBeGreaterThan(result.placements[0]!.startsAt.getTime());
  });

  it("does not block on a dependency outside the candidate set", () => {
    const result = placeTasks(
      [{ id: "mock-exam", durationMinutes: 60, dependsOn: ["already-completed-elsewhere"] }],
      {
        horizonStart: new Date("2026-08-03T01:00:00Z"),
        horizonEnd: new Date("2026-08-10T00:00:00Z"),
        dayShape: WEEKDAY_9_TO_5,
        timezone: "Asia/Singapore",
        busy: [],
      },
    );
    expect(result.overflow).toEqual([]);
    expect(result.placements).toHaveLength(1);
  });

  it("does not shift across the real 2026 DST spring-forward boundary (America/New_York)", () => {
    // 2026-03-08 is the real US spring-forward date: 02:00 -> 03:00 local.
    const dayShape: DayShape = { sunday: { start: "01:00", end: "04:00" } };
    const result = placeTasks(
      [{ id: "t1", durationMinutes: 30 }],
      {
        horizonStart: new Date("2026-03-08T05:00:00.000Z"), // 2026-03-08T00:00 EST
        horizonEnd: new Date("2026-03-09T00:00:00.000Z"),
        dayShape,
        timezone: "America/New_York",
        busy: [],
      },
    );
    // 01:00 local on 2026-03-08 is 06:00 UTC (still EST, offset -05:00, before the 2am jump).
    expect(result.placements).toEqual([{ id: "t1", startsAt: new Date("2026-03-08T06:00:00.000Z") }]);
  });

  it("does not shift across the real 2026 DST fall-back boundary (America/New_York)", () => {
    // 2026-11-01 is the real US fall-back date: 02:00 -> 01:00 local.
    const dayShape: DayShape = { sunday: { start: "03:00", end: "05:00" } };
    const result = placeTasks(
      [{ id: "t1", durationMinutes: 30 }],
      {
        horizonStart: new Date("2026-11-01T00:00:00.000Z"),
        horizonEnd: new Date("2026-11-02T00:00:00.000Z"),
        dayShape,
        timezone: "America/New_York",
        busy: [],
      },
    );
    // 03:00 local on 2026-11-01, after the fall-back, is EST (offset -05:00) -> 08:00 UTC.
    expect(result.placements).toEqual([{ id: "t1", startsAt: new Date("2026-11-01T08:00:00.000Z") }]);
  });
});
