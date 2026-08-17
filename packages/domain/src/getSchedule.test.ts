import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, insertEventRow, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { MAX_SCHEDULE_DAYS } from "./constants.js";
import type { DomainContext } from "./context.js";
import { ScheduleRangeError } from "./errors.js";
import { getSchedule } from "./getSchedule.js";

describe("getSchedule (domain)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function context(now: Date): DomainContext {
    return { now, ownerTimezone: "Asia/Singapore", ownerUserId: OWNER_USER_ID };
  }

  it("groups events by calendar day, including empty days, ordered within each day", async () => {
    // Sunday 2026-08-02 in SGT
    const now = new Date("2026-08-02T04:00:00.000Z");
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Morning standup",
      startsAt: new Date("2026-08-04T01:00:00.000Z"), // 2026-08-04T09:00 SGT
      durationMinutes: 30,
    });
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Lunch",
      startsAt: new Date("2026-08-04T04:00:00.000Z"), // 2026-08-04T12:00 SGT
      durationMinutes: 60,
    });

    const result = await getSchedule(testDb.database, { start: "+1d", end: "+3d" }, context(now));

    expect(result.days).toHaveLength(3); // Aug 3, 4, 5
    expect(result.days[0]?.date).toBe("2026-08-03");
    expect(result.days[0]?.events).toEqual([]); // empty day still present
    expect(result.days[1]?.date).toBe("2026-08-04");
    expect(result.days[1]?.events.map((e) => e.title)).toEqual(["Morning standup", "Lunch"]);
    expect(result.days[2]?.date).toBe("2026-08-05");
    expect(result.days[2]?.events).toEqual([]);
  });

  it("excludes cancelled and rescheduled events by default", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const cancelledEventId = "11111111-1111-1111-1111-111111111111";
    await insertEventRow(testDb.database, {
      eventId: cancelledEventId,
      userId: OWNER_USER_ID,
      title: "Cancelled meeting",
      startsAt: new Date("2026-08-10T01:00:00.000Z"),
      durationMinutes: 30,
      status: "cancelled",
    });

    const excluded = await getSchedule(testDb.database, { start: "+8d", end: "+8d" }, context(now));
    expect(excluded.days[0]?.events).toEqual([]);

    const included = await getSchedule(
      testDb.database,
      { start: "+8d", end: "+8d", includeCancelled: true },
      context(now),
    );
    expect(included.days[0]?.events.map((e) => e.title)).toEqual(["Cancelled meeting"]);
  });

  it("throws ScheduleRangeError when end precedes start", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await expect(getSchedule(testDb.database, { start: "+5d", end: "+2d" }, context(now))).rejects.toThrow(
      ScheduleRangeError,
    );
  });

  it("throws ScheduleRangeError when the range exceeds MAX_SCHEDULE_DAYS", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await expect(
      getSchedule(testDb.database, { start: "today", end: `+${MAX_SCHEDULE_DAYS + 5}d` }, context(now)),
    ).rejects.toThrow(ScheduleRangeError);
  });
});
