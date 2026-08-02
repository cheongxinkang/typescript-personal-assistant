import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startTestDatabase, type TestDatabase } from "../testing.js";
import { ensureOwnerUser, OWNER_USER_ID } from "./users.js";
import { getCurrentEvent, insertEventRow } from "./events.js";

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
    });
    // A later row for the same eventId simulates what a future edit will
    // look like once Stage 5 adds one — insert-only, never UPDATE.
    await insertEventRow(testDb.database, {
      eventId,
      userId: OWNER_USER_ID,
      title: "Corrected title",
      startsAt: new Date("2026-08-03T20:00:00.000Z"),
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
    });
    await insertEventRow(testDb.database, {
      eventId: eventIdB,
      userId: OWNER_USER_ID,
      title: "Event B",
      startsAt: new Date("2026-08-04T10:00:00.000Z"),
    });
    await insertEventRow(testDb.database, {
      eventId: eventIdA,
      userId: OWNER_USER_ID,
      title: "Event A, revised",
      startsAt: new Date("2026-08-04T09:30:00.000Z"),
    });

    expect((await getCurrentEvent(testDb.database, eventIdA))?.title).toBe("Event A, revised");
    expect((await getCurrentEvent(testDb.database, eventIdB))?.title).toBe("Event B");
  });
});
