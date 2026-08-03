import { z } from "zod";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DayWindowSchema = z
  .object({
    start: z.string().regex(TIME_PATTERN, "must be HH:MM, 00:00-23:59"),
    end: z.string().regex(TIME_PATTERN, "must be HH:MM, 00:00-23:59"),
  })
  .refine((window) => window.start < window.end, {
    message: "start must be before end (use a day with no entry to mark it fully unschedulable)",
  });

/**
 * Requirement 18 / decision 13: waking hours per weekday, from a checked-in
 * config file — this schema is the pure validation half; the file read
 * itself lives in apps/server (domain must not touch the filesystem, per
 * Requirement 2). A day with no entry is fully unschedulable — sleep needs
 * no representation of its own.
 */
export const DayShapeSchema = z.object({
  monday: DayWindowSchema.optional(),
  tuesday: DayWindowSchema.optional(),
  wednesday: DayWindowSchema.optional(),
  thursday: DayWindowSchema.optional(),
  friday: DayWindowSchema.optional(),
  saturday: DayWindowSchema.optional(),
  sunday: DayWindowSchema.optional(),
});

export type DayShape = z.infer<typeof DayShapeSchema>;
export type DayWindow = z.infer<typeof DayWindowSchema>;

const WEEKDAY_KEYS: readonly (keyof DayShape)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** luxon's `Weekday` is 1 (Monday) through 7 (Sunday) — this indexes the same way. */
export function dayWindowForWeekday(dayShape: DayShape, luxonWeekday: number): DayWindow | undefined {
  const key = WEEKDAY_KEYS[luxonWeekday - 1];
  return key ? dayShape[key] : undefined;
}
