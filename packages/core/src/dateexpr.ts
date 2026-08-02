import { DateTime } from "luxon";

/**
 * Requirement 21's grammar. The backend resolves every expression — the
 * model supplies one of these forms, never a resolved timestamp. See
 * ARCHITECTURE.md §2 and the Clock in ./clock.ts, which supplies `now`.
 */
export class DateExpressionError extends Error {
  constructor(public readonly expression: string) {
    super(`Could not resolve date expression: "${expression}"`);
    this.name = "DateExpressionError";
  }
}

const WEEKDAY_TOKENS: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

const EXPRESSION_PATTERN = /^(\S+)(?:\s+(\d{1,2}):(\d{2}))?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_DAYS_PATTERN = /^\+(\d+)d$/i;

/**
 * `mon`..`sun` always resolves to a day strictly after today (1-7 days
 * out), never today itself — even when today already is that weekday. A
 * bare weekday name is ambiguous about "today or next week" the moment
 * today matches it; always rolling forward removes the ambiguity rather
 * than guessing. Say "today" if today is meant.
 */
function nextWeekday(todayLocal: DateTime, token: string): DateTime {
  const targetWeekday = WEEKDAY_TOKENS[token];
  if (targetWeekday === undefined) {
    throw new Error(`Not a weekday token: ${token}`);
  }
  const currentWeekday = todayLocal.weekday;
  const daysAhead = ((targetWeekday - currentWeekday + 7) % 7 || 7);
  return todayLocal.plus({ days: daysAhead });
}

function resolveDatePart(datePart: string, nowLocal: DateTime): DateTime {
  const today = nowLocal.startOf("day");
  const lowered = datePart.toLowerCase();

  if (lowered === "today") {
    return today;
  }
  if (lowered === "tomorrow") {
    return today.plus({ days: 1 });
  }
  if (lowered in WEEKDAY_TOKENS) {
    return nextWeekday(today, lowered);
  }

  const relativeDays = RELATIVE_DAYS_PATTERN.exec(datePart);
  if (relativeDays?.[1] !== undefined) {
    return today.plus({ days: Number(relativeDays[1]) });
  }

  if (ISO_DATE_PATTERN.test(datePart)) {
    const parsed = DateTime.fromISO(datePart, { zone: nowLocal.zone });
    if (parsed.isValid) {
      return parsed.startOf("day");
    }
  }

  throw new DateExpressionError(datePart);
}

/**
 * Resolves a Requirement 21 date expression against a single already-read
 * Clock instant (never re-reads the clock — see ./clock.ts) and the
 * owner's IANA timezone. Throws DateExpressionError on any unresolvable
 * input, including a local time that doesn't exist because of a DST
 * spring-forward gap.
 *
 * A time omitted from the expression defaults to 00:00 local — Stage 3's
 * job is correct resolution of what the grammar allows; whether a bare
 * date is acceptable input for a particular tool is that tool's decision.
 */
export function resolveDateExpression(expression: string, now: Date, timezone: string): Date {
  const trimmed = expression.trim();
  const match = EXPRESSION_PATTERN.exec(trimmed);
  if (!match?.[1]) {
    throw new DateExpressionError(expression);
  }
  const [, datePart, hourStr, minuteStr] = match;

  const hour = hourStr !== undefined ? Number(hourStr) : 0;
  const minute = minuteStr !== undefined ? Number(minuteStr) : 0;
  if (hour > 23 || minute > 59) {
    throw new DateExpressionError(expression);
  }

  const nowLocal = DateTime.fromJSDate(now, { zone: timezone });
  if (!nowLocal.isValid) {
    throw new Error(`Invalid IANA timezone: "${timezone}" (${nowLocal.invalidReason ?? "unknown"})`);
  }

  let targetDate: DateTime;
  try {
    targetDate = resolveDatePart(datePart, nowLocal);
  } catch {
    throw new DateExpressionError(expression);
  }

  const resolved = targetDate.set({ hour, minute, second: 0, millisecond: 0 });

  // luxon does not mark a nonexistent local time (spring-forward gap) as
  // invalid — it silently shifts it forward by the gap size instead. The
  // shift changes the reported hour/minute, which is how it's detected
  // here: if what came back doesn't match what was asked for, the
  // requested wall-clock time never existed.
  if (!resolved.isValid || resolved.hour !== hour || resolved.minute !== minute) {
    throw new DateExpressionError(expression);
  }

  return resolved.toJSDate();
}
