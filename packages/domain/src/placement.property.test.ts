import fc from "fast-check";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import type { DayShape } from "./dayShape.js";
import { placeTasks, type PlacementCandidate } from "./placement.js";

const HORIZON_START = new Date("2026-08-03T00:00:00.000Z"); // Monday, in SGT
const HORIZON_END = new Date("2026-09-14T00:00:00.000Z"); // ~6 weeks out — generous room to place into
const TIMEZONE = "Asia/Singapore";

const dayWindowArb = fc.option(
  fc
    .tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 1, max: 4 }))
    .map(([startHour, spanHours]) => ({
      start: `${String(startHour).padStart(2, "0")}:00`,
      end: `${String(Math.min(startHour + spanHours, 23)).padStart(2, "0")}:59`,
    }))
    .filter((w) => w.start < w.end),
  { nil: undefined },
);

const dayShapeArb: fc.Arbitrary<DayShape> = fc.record({
  monday: dayWindowArb,
  tuesday: dayWindowArb,
  wednesday: dayWindowArb,
  thursday: dayWindowArb,
  friday: dayWindowArb,
  saturday: dayWindowArb,
  sunday: dayWindowArb,
});

const candidateArb: fc.Arbitrary<PlacementCandidate> = fc
  .tuple(fc.integer({ min: 0, max: 999 }), fc.integer({ min: 15, max: 240 }))
  .map(([n, durationMinutes]) => ({ id: `t${n}`, durationMinutes }));

describe("placeTasks — property: no overlap, never outside the day shape", () => {
  it("holds for any generated candidate set and day shape", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(candidateArb, { selector: (c) => c.id, maxLength: 12 }),
        dayShapeArb,
        (candidates, dayShape) => {
          const result = placeTasks(candidates, {
            horizonStart: HORIZON_START,
            horizonEnd: HORIZON_END,
            dayShape,
            timezone: TIMEZONE,
            busy: [],
          });

          const durationById = new Map(candidates.map((c) => [c.id, c.durationMinutes ?? 0]));
          const intervals = result.placements
            .map((p) => ({
              start: p.startsAt.getTime(),
              end: p.startsAt.getTime() + (durationById.get(p.id) ?? 0) * 60_000,
            }))
            .sort((a, b) => a.start - b.start);

          // No two placed intervals overlap.
          for (let i = 1; i < intervals.length; i++) {
            const prev = intervals[i - 1];
            const curr = intervals[i];
            if (prev && curr) {
              expect(curr.start).toBeGreaterThanOrEqual(prev.end);
            }
          }

          // Every placement lies within its day's shape window.
          for (const placement of result.placements) {
            const duration = durationById.get(placement.id) ?? 0;
            const withinShape = isWithinDayShape(placement.startsAt, duration, dayShape);
            expect(withinShape).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("placeTasks — property: earlier-deadline candidates are never placed after later ones", () => {
  it("holds when candidates are given in deadline order (the caller's responsibility, per Requirement 18)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.tuple(fc.integer({ min: 0, max: 999 }), fc.integer({ min: 15, max: 120 }), fc.integer({ min: 1, max: 40 })),
          { selector: ([n]) => n, minLength: 2, maxLength: 10 },
        ),
        (tuples) => {
          const withDeadlines: (PlacementCandidate & { deadline: Date })[] = tuples
            .map(([n, durationMinutes, deadlineDayOffset]) => ({
              id: `t${n}`,
              durationMinutes,
              deadline: new Date(HORIZON_START.getTime() + deadlineDayOffset * 24 * 60 * 60_000),
            }))
            .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());

          const result = placeTasks(withDeadlines, {
            horizonStart: HORIZON_START,
            horizonEnd: HORIZON_END,
            dayShape: {
              monday: { start: "09:00", end: "17:00" },
              tuesday: { start: "09:00", end: "17:00" },
              wednesday: { start: "09:00", end: "17:00" },
              thursday: { start: "09:00", end: "17:00" },
              friday: { start: "09:00", end: "17:00" },
              saturday: { start: "09:00", end: "17:00" },
              sunday: { start: "09:00", end: "17:00" },
            },
            timezone: TIMEZONE,
            busy: [],
          });

          const placedInInputOrder = withDeadlines
            .map((c) => result.placements.find((p) => p.id === c.id))
            .filter((p): p is NonNullable<typeof p> => p !== undefined);

          for (let i = 1; i < placedInInputOrder.length; i++) {
            const prev = placedInInputOrder[i - 1];
            const curr = placedInInputOrder[i];
            if (prev && curr) {
              expect(curr.startsAt.getTime()).toBeGreaterThanOrEqual(prev.startsAt.getTime());
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

function isWithinDayShape(startsAt: Date, durationMinutes: number, dayShape: DayShape): boolean {
  const local = DateTime.fromJSDate(startsAt, { zone: TIMEZONE });
  const weekdayKeys = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ] as const;
  const key = weekdayKeys[local.weekday - 1];
  const window = key ? dayShape[key] : undefined;
  if (!window) {
    return false;
  }
  const [startHour, startMinute] = window.start.split(":").map(Number);
  const [endHour, endMinute] = window.end.split(":").map(Number);
  const dayStart = local.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
  const dayEnd = local.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });
  const end = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return startsAt.getTime() >= dayStart.toMillis() && end.getTime() <= dayEnd.toMillis();
}
