import { describe, expect, it } from "vitest";
import { DateExpressionError, resolveDateExpression } from "./dateexpr.js";

const TZ_SG = "Asia/Singapore"; // UTC+8, no DST — the common case
const TZ_NY = "America/New_York"; // has DST — the edge cases

// A fixed Sunday, chosen deliberately: 2026-08-02 is a Sunday, so weekday
// rollover tests below have an unambiguous "same day as today" case to
// exercise (Requirement: bare weekday names always roll forward, never
// resolve to today).
const SUNDAY_NOON_SGT = new Date("2026-08-02T04:00:00.000Z"); // 2026-08-02 12:00 SGT

describe("resolveDateExpression — grammar forms", () => {
  it("resolves an ISO date with no time to local midnight", () => {
    const resolved = resolveDateExpression("2026-08-05", SUNDAY_NOON_SGT, TZ_SG);
    expect(resolved.toISOString()).toBe("2026-08-04T16:00:00.000Z"); // 2026-08-05T00:00 SGT
  });

  it("resolves an ISO date with a time", () => {
    const resolved = resolveDateExpression("2026-08-05 19:00", SUNDAY_NOON_SGT, TZ_SG);
    expect(resolved.toISOString()).toBe("2026-08-05T11:00:00.000Z"); // 2026-08-05T19:00 SGT
  });

  it("resolves 'today'", () => {
    const resolved = resolveDateExpression("today", SUNDAY_NOON_SGT, TZ_SG);
    expect(resolved.toISOString()).toBe("2026-08-01T16:00:00.000Z"); // 2026-08-02T00:00 SGT
  });

  it("resolves 'tomorrow'", () => {
    const resolved = resolveDateExpression("tomorrow 07:00", SUNDAY_NOON_SGT, TZ_SG);
    expect(resolved.toISOString()).toBe("2026-08-02T23:00:00.000Z"); // 2026-08-03T07:00 SGT
  });

  it("resolves '+Nd'", () => {
    const resolved = resolveDateExpression("+3d 09:30", SUNDAY_NOON_SGT, TZ_SG);
    expect(resolved.toISOString()).toBe("2026-08-05T01:30:00.000Z"); // 2026-08-05T09:30 SGT
  });

  it("is case-insensitive on keyword tokens", () => {
    const lower = resolveDateExpression("TOMORROW 07:00", SUNDAY_NOON_SGT, TZ_SG);
    const upper = resolveDateExpression("Tomorrow 07:00", SUNDAY_NOON_SGT, TZ_SG);
    expect(lower).toEqual(upper);
  });

  it("defaults to 00:00 local when no time is given", () => {
    const resolved = resolveDateExpression("tomorrow", SUNDAY_NOON_SGT, TZ_SG);
    expect(resolved.toISOString()).toBe("2026-08-02T16:00:00.000Z"); // 2026-08-03T00:00 SGT
  });
});

describe("resolveDateExpression — weekday names always roll strictly forward", () => {
  // "today" (2026-08-02) is a Sunday.

  it("a bare weekday matching today resolves to next week, never today", () => {
    const resolved = resolveDateExpression("sun 10:00", SUNDAY_NOON_SGT, TZ_SG);
    expect(resolved.toISOString()).toBe("2026-08-09T02:00:00.000Z"); // 2026-08-09 (next Sunday) 10:00 SGT
  });

  it("resolves the nearest upcoming weekday within the week", () => {
    const monday = resolveDateExpression("mon 09:00", SUNDAY_NOON_SGT, TZ_SG);
    expect(monday.toISOString()).toBe("2026-08-03T01:00:00.000Z"); // 2026-08-03 (Mon) 09:00 SGT

    const saturday = resolveDateExpression("sat 09:00", SUNDAY_NOON_SGT, TZ_SG);
    expect(saturday.toISOString()).toBe("2026-08-08T01:00:00.000Z"); // 2026-08-08 (Sat) 09:00 SGT
  });

  it("resolves every weekday token to a date strictly after today", () => {
    const tokens = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    for (const token of tokens) {
      const resolved = resolveDateExpression(token, SUNDAY_NOON_SGT, TZ_SG);
      expect(resolved.getTime()).toBeGreaterThan(SUNDAY_NOON_SGT.getTime());
    }
  });
});

describe("resolveDateExpression — month and year boundaries", () => {
  it("'+Nd' crosses a month boundary", () => {
    const endOfJanuary = new Date("2026-01-31T04:00:00.000Z"); // 2026-01-31 12:00 SGT
    const resolved = resolveDateExpression("+1d", endOfJanuary, TZ_SG);
    expect(resolved.toISOString()).toBe("2026-01-31T16:00:00.000Z"); // 2026-02-01T00:00 SGT
  });

  it("'tomorrow' crosses a year boundary", () => {
    const newYearsEve = new Date("2026-12-31T04:00:00.000Z"); // 2026-12-31 12:00 SGT
    const resolved = resolveDateExpression("tomorrow", newYearsEve, TZ_SG);
    expect(resolved.toISOString()).toBe("2026-12-31T16:00:00.000Z"); // 2027-01-01T00:00 SGT
  });

  it("an ISO date across a leap day resolves correctly", () => {
    // 2028 is a leap year.
    const resolved = resolveDateExpression("2028-02-29", SUNDAY_NOON_SGT, TZ_SG);
    expect(resolved.toISOString()).toBe("2028-02-28T16:00:00.000Z");
  });
});

describe("resolveDateExpression — DST", () => {
  it("rejects a local time that does not exist in a spring-forward gap", () => {
    // 2026 US DST begins 2026-03-08: America/New_York clocks jump from
    // 02:00 to 03:00, so 02:30 never happens that day.
    const beforeTransition = new Date("2026-03-01T12:00:00.000Z");
    expect(() => resolveDateExpression("2026-03-08 02:30", beforeTransition, TZ_NY)).toThrow(
      DateExpressionError,
    );
  });

  it("accepts a local time just before the spring-forward gap", () => {
    const beforeTransition = new Date("2026-03-01T12:00:00.000Z");
    const resolved = resolveDateExpression("2026-03-08 01:30", beforeTransition, TZ_NY);
    expect(resolved.toISOString()).toBe("2026-03-08T06:30:00.000Z"); // still EST (UTC-5)
  });

  it("accepts a local time just after the spring-forward gap", () => {
    const beforeTransition = new Date("2026-03-01T12:00:00.000Z");
    const resolved = resolveDateExpression("2026-03-08 03:30", beforeTransition, TZ_NY);
    expect(resolved.toISOString()).toBe("2026-03-08T07:30:00.000Z"); // now EDT (UTC-4)
  });

  it("resolves an ambiguous fall-back local time deterministically", () => {
    // 2026 US DST ends 2026-11-01: 01:30 occurs twice. Not rejected — only
    // a nonexistent (spring-forward) time is — but must be stable.
    const beforeTransition = new Date("2026-10-01T12:00:00.000Z");
    const first = resolveDateExpression("2026-11-01 01:30", beforeTransition, TZ_NY);
    const second = resolveDateExpression("2026-11-01 01:30", beforeTransition, TZ_NY);
    expect(first.toISOString()).toBe(second.toISOString());
  });
});

describe("resolveDateExpression — rejected input", () => {
  it.each([
    "not-a-date",
    "2026-13-01", // invalid month
    "2026-08-32", // invalid day
    "tomorrow 25:00", // invalid hour
    "tomorrow 12:60", // invalid minute
    "+d", // missing count
    "+3", // missing unit
    "",
    "   ",
  ])("rejects %j", (expression) => {
    expect(() => resolveDateExpression(expression, SUNDAY_NOON_SGT, TZ_SG)).toThrow(
      DateExpressionError,
    );
  });

  it("throws DateExpressionError carrying the original expression", () => {
    try {
      resolveDateExpression("nonsense", SUNDAY_NOON_SGT, TZ_SG);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DateExpressionError);
      expect((error as DateExpressionError).expression).toBe("nonsense");
    }
  });
});

describe("resolveDateExpression — invalid timezone", () => {
  it("throws a plain Error, not DateExpressionError, for a bad timezone", () => {
    // A malformed OWNER_TIMEZONE is a configuration problem, not something
    // retrying the same tool call with a different expression would fix.
    expect(() => resolveDateExpression("today", SUNDAY_NOON_SGT, "Not/A_Zone")).toThrow(Error);
    try {
      resolveDateExpression("today", SUNDAY_NOON_SGT, "Not/A_Zone");
    } catch (error) {
      expect(error).not.toBeInstanceOf(DateExpressionError);
    }
  });
});
