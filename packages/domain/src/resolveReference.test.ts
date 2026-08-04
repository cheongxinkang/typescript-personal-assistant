import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, insertEventRow, insertTaskRow, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { AmbiguousReferenceError, NotFoundError } from "./errors.js";
import { resolveEventReference, resolveTaskReference } from "./resolveReference.js";

describe("resolveEventReference", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  const now = new Date("2026-08-02T04:00:00.000Z");

  it("resolves directly by id, no query against title", async () => {
    const event = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Direct id lookup",
      startsAt: new Date("2026-08-03T01:00:00.000Z"),
      durationMinutes: 30,
    });

    const resolved = await resolveEventReference(
      testDb.database,
      OWNER_USER_ID,
      { id: event.eventId },
      now,
      "Asia/Singapore",
    );
    expect(resolved.eventId).toBe(event.eventId);
  });

  it("throws NotFoundError for a well-formed but non-existent id", async () => {
    await expect(
      resolveEventReference(
        testDb.database,
        OWNER_USER_ID,
        { id: "00000000-0000-0000-0000-000000000000" },
        now,
        "Asia/Singapore",
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("resolves a unique case-insensitive title match — the bug this fixes", async () => {
    const event = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Call with Priya",
      startsAt: new Date("2026-08-03T06:00:00.000Z"),
      durationMinutes: 30,
    });

    const resolved = await resolveEventReference(
      testDb.database,
      OWNER_USER_ID,
      { title: "call with priya" },
      now,
      "Asia/Singapore",
    );
    expect(resolved.eventId).toBe(event.eventId);
  });

  it("resolves a substring title match", async () => {
    const event = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Dentist appointment",
      startsAt: new Date("2026-08-03T07:00:00.000Z"),
      durationMinutes: 30,
    });

    const resolved = await resolveEventReference(
      testDb.database,
      OWNER_USER_ID,
      { title: "dentist" },
      now,
      "Asia/Singapore",
    );
    expect(resolved.eventId).toBe(event.eventId);
  });

  it("excludes completed/cancelled events from a title search — they're not actionable", async () => {
    const completed = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Already-done standup",
      startsAt: new Date("2026-08-03T08:00:00.000Z"),
      durationMinutes: 15,
      status: "completed",
    });
    await insertEventRow(testDb.database, {
      eventId: completed.eventId,
      userId: OWNER_USER_ID,
      title: "Already-done standup",
      startsAt: new Date("2026-08-03T08:00:00.000Z"),
      durationMinutes: 15,
      status: "completed",
    });

    await expect(
      resolveEventReference(testDb.database, OWNER_USER_ID, { title: "Already-done standup" }, now, "Asia/Singapore"),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when no title matches anything", async () => {
    await expect(
      resolveEventReference(testDb.database, OWNER_USER_ID, { title: "no such event exists anywhere" }, now, "Asia/Singapore"),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws AmbiguousReferenceError naming every candidate when a title matches more than one event", async () => {
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Standup — ambiguous case",
      startsAt: new Date("2026-08-05T01:00:00.000Z"),
      durationMinutes: 15,
    });
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Standup — ambiguous case",
      startsAt: new Date("2026-08-06T01:00:00.000Z"),
      durationMinutes: 15,
    });

    try {
      await resolveEventReference(
        testDb.database,
        OWNER_USER_ID,
        { title: "Standup — ambiguous case" },
        now,
        "Asia/Singapore",
      );
      expect.unreachable("should have thrown AmbiguousReferenceError");
    } catch (error) {
      expect(error).toBeInstanceOf(AmbiguousReferenceError);
      const ambiguous = error as AmbiguousReferenceError;
      expect(ambiguous.candidates).toHaveLength(2);
      expect(ambiguous.message).toContain("Standup — ambiguous case");
    }
  });

  it("dateHint narrows an otherwise-ambiguous title to a single day", async () => {
    await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Narrowed by date",
      startsAt: new Date("2026-08-10T01:00:00.000Z"),
      durationMinutes: 15,
    });
    const wantedDay = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Narrowed by date",
      startsAt: new Date("2026-08-11T01:00:00.000Z"),
      durationMinutes: 15,
    });

    const resolved = await resolveEventReference(
      testDb.database,
      OWNER_USER_ID,
      { title: "Narrowed by date", dateHint: "2026-08-11" },
      now,
      "Asia/Singapore",
    );
    expect(resolved.eventId).toBe(wantedDay.eventId);
  });
});

describe("resolveTaskReference", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("resolves directly by id", async () => {
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Direct id lookup task" });
    const resolved = await resolveTaskReference(testDb.database, OWNER_USER_ID, { id: task.taskId }, "Asia/Singapore");
    expect(resolved.taskId).toBe(task.taskId);
  });

  it("resolves a unique case-insensitive title match", async () => {
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Pick a static site generator" });
    const resolved = await resolveTaskReference(
      testDb.database,
      OWNER_USER_ID,
      { title: "pick a static site generator" },
      "Asia/Singapore",
    );
    expect(resolved.taskId).toBe(task.taskId);
  });

  it("excludes completed/cancelled tasks from a title search", async () => {
    const task = await insertTaskRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Already-done unique task title",
      status: "completed",
    });
    await insertTaskRow(testDb.database, {
      taskId: task.taskId,
      userId: OWNER_USER_ID,
      title: "Already-done unique task title",
      status: "completed",
    });

    await expect(
      resolveTaskReference(testDb.database, OWNER_USER_ID, { title: "Already-done unique task title" }, "Asia/Singapore"),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws AmbiguousReferenceError naming every candidate when a title matches more than one open task", async () => {
    await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Duplicate task title" });
    await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Duplicate task title" });

    try {
      await resolveTaskReference(testDb.database, OWNER_USER_ID, { title: "Duplicate task title" }, "Asia/Singapore");
      expect.unreachable("should have thrown AmbiguousReferenceError");
    } catch (error) {
      expect(error).toBeInstanceOf(AmbiguousReferenceError);
      expect((error as AmbiguousReferenceError).candidates).toHaveLength(2);
    }
  });
});
