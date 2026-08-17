import { DateTime } from "luxon";
import { z } from "zod";
import {
  resolveDateExpression,
  type ScheduleData,
  type ScheduleDayGroup,
  type ScheduleEventEntry,
} from "@assistant/core";
import { listEventsInRange, type Database } from "@assistant/db";
import { MAX_SCHEDULE_DAYS } from "./constants.js";
import type { DomainContext } from "./context.js";
import { ScheduleRangeError } from "./errors.js";

export const getScheduleInputSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  includeCancelled: z.boolean().optional(),
});

export type GetScheduleInput = z.infer<typeof getScheduleInputSchema>;

/**
 * Requirement 17: `start`/`end` are date expressions resolved the same way
 * as everywhere else — `end` names the **last included day**, not an
 * instant, so the actual query bound is the day after it. Events-only
 * (decision 15): a task with a deadline in range but no event never
 * appears here.
 */
export async function getSchedule(
  database: Database,
  input: GetScheduleInput,
  context: DomainContext,
): Promise<ScheduleData> {
  const startInclusive = resolveDateExpression(input.start, context.now, context.ownerTimezone);
  const endDayStart = resolveDateExpression(input.end, context.now, context.ownerTimezone);
  const endExclusive = new Date(endDayStart.getTime() + 24 * 60 * 60_000);

  if (endExclusive.getTime() <= startInclusive.getTime()) {
    throw new ScheduleRangeError(
      `Range end ("${input.end}") must not be before range start ("${input.start}")`,
    );
  }

  const totalDays = Math.round((endExclusive.getTime() - startInclusive.getTime()) / (24 * 60 * 60_000));
  if (totalDays > MAX_SCHEDULE_DAYS) {
    throw new ScheduleRangeError(
      `Range spans ${totalDays} days, exceeding the maximum of ${MAX_SCHEDULE_DAYS}`,
    );
  }

  const events = await listEventsInRange(database, {
    userId: context.ownerUserId,
    startInclusive,
    endExclusive,
    includeCancelled: input.includeCancelled,
  });

  // Every calendar day in range gets a group up front, even if it stays
  // empty (Requirement 17: "a gap in the schedule is information").
  const dayMap = new Map<string, ScheduleEventEntry[]>();
  let cursor = DateTime.fromJSDate(startInclusive, { zone: context.ownerTimezone }).startOf("day");
  const endLocal = DateTime.fromJSDate(endExclusive, { zone: context.ownerTimezone }).startOf("day");
  while (cursor < endLocal) {
    const isoDate = cursor.toISODate();
    if (isoDate) {
      dayMap.set(isoDate, []);
    }
    cursor = cursor.plus({ days: 1 });
  }

  for (const event of events) {
    const localDate = DateTime.fromJSDate(event.startsAt, { zone: context.ownerTimezone }).toISODate();
    if (!localDate) {
      continue;
    }
    const entry: ScheduleEventEntry = {
      eventId: event.eventId,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      durationMinutes: event.durationMinutes,
      status: event.status,
    };
    const bucket = dayMap.get(localDate);
    if (bucket) {
      bucket.push(entry);
    } else {
      // Boundary event just outside the day-grouping loop's range — the
      // range query itself is the source of truth, so still show it.
      dayMap.set(localDate, [entry]);
    }
  }

  const days: ScheduleDayGroup[] = [...dayMap.entries()]
    .map(([date, dayEvents]) => ({
      date,
      events: [...dayEvents].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    start: startInclusive.toISOString(),
    end: endExclusive.toISOString(),
    days,
  };
}
