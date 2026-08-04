import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startTestDatabase, type TestDatabase } from "../testing.js";
import { ensureOwnerUser, OWNER_USER_ID } from "./users.js";
import {
  getCurrentEvent,
  insertEventRow,
  listAllEventsForOwner,
  listEventsInRange,
  listNonCancelledEventsByTaskId,
} from "./events.js";

describe("events fold view (events_current)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns the only row when there is exactly one", async () => {
    const eventId = randomUUID();
    await insertEventRow(testDb.database, {
      eventId,
      userId: OWNER_USER_ID,
      title: "Dinner with Cheryl",
      startsAt: new Date("2026-08-03T19:00:00.000Z"),
      durationMinutes: 60,
    });

    const current = await getCurrentEvent(testDb.database, eventId);
    expect(current?.title).toBe("Dinner with Cheryl");
  });

  it("folds to the later row when two rows share an event_id — Requirement 25", async () => {
    const eventId = randomUUID();
    await insertEventRow(testDb.database, {
      eventId,
      userId: OWNER_USER_ID,
      title: "Original title",
      startsAt: new Date("2026-08-03T19:00:00.000Z"),
      durationMinutes: 60,
    });
    // A later row for the same eventId simulates what a future edit will
    // look like once Stage 5 adds one — insert-only, never UPDATE.
    await insertEventRow(testDb.database, {
      eventId,
      userId: OWNER_USER_ID,
      title: "Corrected title",
      startsAt: new Date("2026-08-03T20:00:00.000Z"),
      durationMinutes: 60,
    });

    const current = await getCurrentEvent(testDb.database, eventId);
    expect(current?.title).toBe("Corrected title");
  });

  it("leaves other event ids untouched by a fold on a different id", async () => {
    const eventIdA = randomUUID();
    const eventIdB = randomUUID();
    await insertEventRow(testDb.database, {
      eventId: eventIdA,
      userId: OWNER_USER_ID,
      title: "Event A",
      startsAt: new Date("2026-08-04T09:00:00.000Z"),
      durationMinutes: 60,
    });
    await insertEventRow(testDb.database, {
      eventId: eventIdB,
      userId: OWNER_USER_ID,
      title: "Event B",
      startsAt: new Date("2026-08-04T10:00:00.000Z"),
      durationMinutes: 60,
    });
    await insertEventRow(testDb.database, {
      eventId: eventIdA,
      userId: OWNER_USER_ID,
      title: "Event A, revised",
      startsAt: new Date("2026-08-04T09:30:00.000Z"),
      durationMinutes: 60,
    });

    expect((await getCurrentEvent(testDb.database, eventIdA))?.title).toBe("Event A, revised");
    expect((await getCurrentEvent(testDb.database, eventIdB))?.title).toBe("Event B");
  });
});

describe("listEventsInRange", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("bounds the range and excludes cancelled/rescheduled by default", async () => {
    const inRange = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "In range",
      startsAt: new Date("2026-09-01T01:00:00.000Z"),
      durationMinutes: 30,
    });
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Before range",
      startsAt: new Date("2026-08-31T01:00:00.000Z"),
      durationMinutes: 30,
    });
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Cancelled in range",
      startsAt: new Date("2026-09-01T05:00:00.000Z"),
      durationMinutes: 30,
      status: "cancelled",
    });

    const results = await listEventsInRange(testDb.database, {
      userId: OWNER_USER_ID,
      startInclusive: new Date("2026-09-01T00:00:00.000Z"),
      endExclusive: new Date("2026-09-02T00:00:00.000Z"),
    });

    expect(results.map((e) => e.eventId)).toEqual([inRange.eventId]);
  });

  it("includes cancelled/rescheduled when includeCancelled is true", async () => {
    const cancelled = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Cancelled",
      startsAt: new Date("2026-09-10T01:00:00.000Z"),
      durationMinutes: 30,
      status: "cancelled",
    });

    const results = await listEventsInRange(testDb.database, {
      userId: OWNER_USER_ID,
      startInclusive: new Date("2026-09-10T00:00:00.000Z"),
      endExclusive: new Date("2026-09-11T00:00:00.000Z"),
      includeCancelled: true,
    });

    expect(results.map((e) => e.eventId)).toContain(cancelled.eventId);
  });
});

describe("listNonCancelledEventsByTaskId", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns only non-cancelled events for the given taskId", async () => {
    const taskId = randomUUID();
    const planned = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Planned session",
      startsAt: new Date("2026-09-15T01:00:00.000Z"),
      durationMinutes: 30,
      taskId,
    });
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Cancelled session",
      startsAt: new Date("2026-09-16T01:00:00.000Z"),
      durationMinutes: 30,
      taskId,
      status: "cancelled",
    });

    const results = await listNonCancelledEventsByTaskId(testDb.database, taskId);
    expect(results.map((e) => e.eventId)).toEqual([planned.eventId]);
  });

  it("returns an empty array for a taskId with no events", async () => {
    const results = await listNonCancelledEventsByTaskId(testDb.database, randomUUID());
    expect(results).toEqual([]);
  });
});

describe("listAllEventsForOwner", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns every status, ascending by startsAt, capped at the given limit — phase_2a-db-visibility.md Requirement 4/7", async () => {
    const laterId = randomUUID();
    await insertEventRow(testDb.database, {
      eventId: laterId,
      userId: OWNER_USER_ID,
      title: "Later, cancelled",
      startsAt: new Date("2026-08-10T10:00:00.000Z"),
      durationMinutes: 30,
      status: "cancelled",
    });
    const earlierId = randomUUID();
    await insertEventRow(testDb.database, {
      eventId: earlierId,
      userId: OWNER_USER_ID,
      title: "Earlier, planned",
      startsAt: new Date("2026-08-01T10:00:00.000Z"),
      durationMinutes: 30,
    });

    const rows = await listAllEventsForOwner(testDb.database, OWNER_USER_ID, 500);
    const relevant = rows.filter((r) => r.eventId === laterId || r.eventId === earlierId);
    // Ascending by startsAt, and the cancelled one is included — unlike listEventsInRange's default.
    expect(relevant.map((r) => r.eventId)).toEqual([earlierId, laterId]);

    const limited = await listAllEventsForOwner(testDb.database, OWNER_USER_ID, 1);
    expect(limited).toHaveLength(1);
  });
});
