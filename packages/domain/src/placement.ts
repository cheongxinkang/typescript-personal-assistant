import { DateTime } from "luxon";
import { dayWindowForWeekday, type DayShape } from "./dayShape.js";

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface PlacementCandidate {
  id: string;
  /** `null`/`undefined` means no estimate exists — always overflow (Requirement 18's edge case). */
  durationMinutes: number | null | undefined;
  deadline?: Date;
}

export interface Placement {
  id: string;
  startsAt: Date;
}

export type OverflowReason = "no_estimate" | "deadline_passed" | "no_free_interval";

export interface OverflowItem {
  id: string;
  reason: OverflowReason;
}

export interface PlaceTasksParams {
  horizonStart: Date;
  horizonEnd: Date;
  dayShape: DayShape;
  timezone: string;
  busy: readonly BusyInterval[];
}

export interface PlaceTasksResult {
  placements: Placement[];
  overflow: OverflowItem[];
}

/** Sorted, with overlapping/touching intervals combined into one. */
export function mergeIntervals(intervals: readonly BusyInterval[]): BusyInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: BusyInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start.getTime() <= last.end.getTime()) {
      if (interval.end.getTime() > last.end.getTime()) {
        last.end = interval.end;
      }
    } else {
      merged.push({ start: interval.start, end: interval.end });
    }
  }
  return merged;
}

/** Requirement 18's "overlapping ones merge" — derives busy intervals from committed events. */
export function deriveBusyIntervals(
  events: readonly { startsAt: Date; durationMinutes: number }[],
): BusyInterval[] {
  return mergeIntervals(
    events.map((event) => ({
      start: event.startsAt,
      end: new Date(event.startsAt.getTime() + event.durationMinutes * 60_000),
    })),
  );
}

function dayShapeWindowOn(
  localDay: DateTime,
  dayShape: DayShape,
): { start: Date; end: Date } | undefined {
  const window = dayWindowForWeekday(dayShape, localDay.weekday);
  if (!window) {
    return undefined;
  }
  const [startHour, startMinute] = window.start.split(":").map(Number);
  const [endHour, endMinute] = window.end.split(":").map(Number);
  const start = localDay.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
  const end = localDay.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });
  return { start: start.toJSDate(), end: end.toJSDate() };
}

/** Every day-shape window within [cursor, horizonEnd), clamped to that range. */
function schedulableWindows(
  cursor: Date,
  horizonEnd: Date,
  dayShape: DayShape,
  timezone: string,
): { start: Date; end: Date }[] {
  const windows: { start: Date; end: Date }[] = [];
  let day = DateTime.fromJSDate(cursor, { zone: timezone }).startOf("day");
  const lastDay = DateTime.fromJSDate(horizonEnd, { zone: timezone }).startOf("day");

  while (day <= lastDay) {
    const window = dayShapeWindowOn(day, dayShape);
    if (window) {
      const start = window.start.getTime() > cursor.getTime() ? window.start : cursor;
      const end = window.end.getTime() < horizonEnd.getTime() ? window.end : horizonEnd;
      if (start.getTime() < end.getTime()) {
        windows.push({ start, end });
      }
    }
    day = day.plus({ days: 1 });
  }

  return windows;
}

/** The free sub-intervals of `window` after removing every overlapping occupied interval. */
function subtractOccupied(
  window: { start: Date; end: Date },
  occupied: readonly BusyInterval[],
): { start: Date; end: Date }[] {
  const relevant = occupied
    .filter((o) => o.end.getTime() > window.start.getTime() && o.start.getTime() < window.end.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const gaps: { start: Date; end: Date }[] = [];
  let cursor = window.start;

  for (const occupiedInterval of relevant) {
    const clampedStart =
      occupiedInterval.start.getTime() < window.start.getTime() ? window.start : occupiedInterval.start;
    if (clampedStart.getTime() > cursor.getTime()) {
      gaps.push({ start: cursor, end: clampedStart });
    }
    const clampedEnd =
      occupiedInterval.end.getTime() > window.end.getTime() ? window.end : occupiedInterval.end;
    if (clampedEnd.getTime() > cursor.getTime()) {
      cursor = clampedEnd;
    }
  }

  if (cursor.getTime() < window.end.getTime()) {
    gaps.push({ start: cursor, end: window.end });
  }

  return gaps;
}

function findFreeSlot(
  windows: readonly { start: Date; end: Date }[],
  occupied: readonly BusyInterval[],
  durationMs: number,
): { start: Date; end: Date } | undefined {
  for (const window of windows) {
    for (const gap of subtractOccupied(window, occupied)) {
      if (gap.end.getTime() - gap.start.getTime() >= durationMs) {
        return { start: gap.start, end: new Date(gap.start.getTime() + durationMs) };
      }
    }
  }
  return undefined;
}

/**
 * Requirement 18: first-fit forward, no backfilling. Candidates are placed
 * in the order given — the caller (Stage 6's generation) is responsible for
 * ordering by deadline first, since this function trusts that order rather
 * than re-sorting. A single monotonic `cursor` (never reset backward) is
 * what makes "no backfilling" true: once a gap has been passed over, it is
 * never reconsidered for a later candidate, even one that would fit it.
 *
 * Never truncates or drops silently — every candidate ends up in either
 * `placements` or `overflow`, always with a reason (Requirement 25's
 * "reported as overflow, never truncated").
 */
export function placeTasks(
  candidates: readonly PlacementCandidate[],
  params: PlaceTasksParams,
): PlaceTasksResult {
  let occupied = mergeIntervals(params.busy);
  let cursor = params.horizonStart;
  const placements: Placement[] = [];
  const overflow: OverflowItem[] = [];

  for (const candidate of candidates) {
    if (candidate.durationMinutes == null) {
      overflow.push({ id: candidate.id, reason: "no_estimate" });
      continue;
    }
    if (candidate.deadline && candidate.deadline.getTime() < params.horizonStart.getTime()) {
      overflow.push({ id: candidate.id, reason: "deadline_passed" });
      continue;
    }

    const windows = schedulableWindows(cursor, params.horizonEnd, params.dayShape, params.timezone);
    const slot = findFreeSlot(windows, occupied, candidate.durationMinutes * 60_000);

    if (!slot) {
      overflow.push({ id: candidate.id, reason: "no_free_interval" });
      continue;
    }

    placements.push({ id: candidate.id, startsAt: slot.start });
    occupied = mergeIntervals([...occupied, slot]);
    cursor = slot.end;
  }

  return { placements, overflow };
}
