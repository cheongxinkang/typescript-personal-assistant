import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, getCurrentEvent, insertEventRow, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import type { DomainContext } from "./context.js";
import { NotFoundError } from "./errors.js";
import { updateEvent, updateEventInputSchema } from "./updateEvent.js";

describe("updateEvent (domain)", () => {
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

  describe("complete", () => {
    it("records actualMinutes without touching the planned durationMinutes — Requirement 16", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Write chapter",
        startsAt: new Date("2026-08-03T01:00:00.000Z"),
        durationMinutes: 120,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "complete", eventId: event.eventId, actualMinutes: 90 },
        context(now),
      );

      expect(result.status).toBe("completed");
      expect(result.durationMinutes).toBe(120); // untouched
      expect(result.actualMinutes).toBe(90);
    });

    it("defaults actualMinutes to the planned duration when omitted", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Standup",
        startsAt: new Date("2026-08-03T01:00:00.000Z"),
        durationMinutes: 30,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "complete", eventId: event.eventId },
        context(now),
      );
      expect(result.actualMinutes).toBe(30);
    });

    it("is idempotent when completing an already-completed event", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Once",
        startsAt: new Date("2026-08-03T01:00:00.000Z"),
        durationMinutes: 30,
      });
      await updateEvent(testDb.database, { action: "complete", eventId: event.eventId }, context(now));

      const second = await updateEvent(
        testDb.database,
        { action: "complete", eventId: event.eventId },
        context(now),
      );
      expect(second.status).toBe("completed");
    });
  });

  describe("cancel", () => {
    it("cancels an event, freeing it from future clash checks", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "No longer needed",
        startsAt: new Date("2026-08-03T01:00:00.000Z"),
        durationMinutes: 30,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "cancel", eventId: event.eventId },
        context(now),
      );
      expect(result.status).toBe("cancelled");
    });

    it("is idempotent when cancelling an already-cancelled event", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Twice",
        startsAt: new Date("2026-08-03T01:00:00.000Z"),
        durationMinutes: 30,
      });
      await updateEvent(testDb.database, { action: "cancel", eventId: event.eventId }, context(now));

      const second = await updateEvent(
        testDb.database,
        { action: "cancel", eventId: event.eventId },
        context(now),
      );
      expect(second.status).toBe("cancelled");
    });
  });

  describe("move", () => {
    it("marks the original rescheduled and creates a new event carrying movedFromEventId", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Team sync",
        startsAt: new Date("2026-08-03T01:00:00.000Z"),
        durationMinutes: 30,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "move", eventId: event.eventId, dateExpression: "+5d 10:00" },
        context(now),
      );

      expect(result.eventId).not.toBe(event.eventId);
      expect(result.movedFromEventId).toBe(event.eventId);
      expect(result.status).toBe("planned");

      const original = await getCurrentEvent(testDb.database, event.eventId);
      expect(original?.status).toBe("rescheduled");
    });

    it("reports a clash with an existing planned event at the new time", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const other = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Fixed appointment",
        startsAt: new Date("2026-08-08T06:00:00.000Z"), // +6d 14:00 SGT
        durationMinutes: 60,
      });
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Movable meeting",
        startsAt: new Date("2026-08-03T01:00:00.000Z"),
        durationMinutes: 30,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "move", eventId: event.eventId, dateExpression: "+6d 14:15" },
        context(now),
      );

      expect(result.clashesWith).toEqual([other.eventId]);
    });

    it("resizes without moving when only durationMinutes is given — the real bug: previously the only way to resize was cancel-and-re-add, which needed two tool calls the loop can't make in one turn", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const startsAt = new Date("2026-08-05T10:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "NSFIT",
        startsAt,
        durationMinutes: 30,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "move", eventId: event.eventId, durationMinutes: 180 },
        context(now),
      );

      expect(result.status).toBe("planned");
      expect(result.durationMinutes).toBe(180);
      expect(new Date(result.startsAt).getTime()).toBe(startsAt.getTime());

      const original = await getCurrentEvent(testDb.database, event.eventId);
      expect(original?.status).toBe("rescheduled");
    });

    it("moves and resizes together when both are given", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const originalStartsAt = new Date("2026-08-05T10:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "NSFIT",
        startsAt: originalStartsAt,
        durationMinutes: 30,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "move", eventId: event.eventId, dateExpression: "+3d 21:00", durationMinutes: 180 },
        context(now),
      );

      expect(result.durationMinutes).toBe(180);
      expect(new Date(result.startsAt).getTime()).not.toBe(originalStartsAt.getTime());
    });

    it("rejects a move with neither dateExpression nor durationMinutes", () => {
      expect(
        updateEventInputSchema.safeParse({ action: "move", eventId: "e1" }).success,
      ).toBe(false);
    });
  });

  describe("split", () => {
    it("marks the completed portion done and reports the remainder, without creating a row for it", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Migrate posts",
        startsAt: new Date("2026-08-03T01:00:00.000Z"),
        durationMinutes: 120,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "split", eventId: event.eventId, completedMinutes: 60 },
        context(now),
      );

      expect(result.status).toBe("completed");
      expect(result.durationMinutes).toBe(60);
      expect(result.actualMinutes).toBe(60);
      expect(result.remainderMinutes).toBe(60);
    });

    it("treats a completed portion at or beyond the full duration as a plain completion", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Short task",
        startsAt: new Date("2026-08-03T01:00:00.000Z"),
        durationMinutes: 30,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "split", eventId: event.eventId, completedMinutes: 45 },
        context(now),
      );

      expect(result.status).toBe("completed");
      expect(result.remainderMinutes).toBeNull();
    });

    it("places the remainder as a real event when a day shape is supplied — Stage 4", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z"); // Sunday, 12:00 SGT
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Migrate posts, take 2",
        startsAt: new Date("2026-08-03T01:00:00.000Z"), // Monday 09:00 SGT
        durationMinutes: 120,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "split", eventId: event.eventId, completedMinutes: 60 },
        {
          now,
          ownerTimezone: "Asia/Singapore",
          ownerUserId: OWNER_USER_ID,
          dayShape: {
            monday: { start: "09:00", end: "17:00" },
            tuesday: { start: "09:00", end: "17:00" },
            wednesday: { start: "09:00", end: "17:00" },
            thursday: { start: "09:00", end: "17:00" },
            friday: { start: "09:00", end: "17:00" },
          },
        },
      );

      expect(result.remainderMinutes).toBeNull();
      expect(result.remainderEventId).toBeDefined();
      expect(result.remainderStartsAt).toBeDefined();

      // The remainder must be findable as a real, folded event row.
      const remainderRow = await getCurrentEvent(testDb.database, result.remainderEventId ?? "");
      expect(remainderRow?.durationMinutes).toBe(60);
      expect(remainderRow?.parentEventId).toBe(event.eventId);
      expect(remainderRow?.status).toBe("planned");
    });

    it("falls back to reporting the remainder when no free slot exists in the horizon", async () => {
      const now = new Date("2026-08-02T04:00:00.000Z");
      const event = await insertEventRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "No room task",
        startsAt: new Date("2026-08-03T01:00:00.000Z"),
        durationMinutes: 60,
      });

      const result = await updateEvent(
        testDb.database,
        { action: "split", eventId: event.eventId, completedMinutes: 30 },
        {
          now,
          ownerTimezone: "Asia/Singapore",
          ownerUserId: OWNER_USER_ID,
          // No days enabled at all — nowhere in the horizon can ever fit.
          dayShape: {},
        },
      );

      expect(result.remainderEventId).toBeNull();
      expect(result.remainderMinutes).toBe(30);
    });
  });

  it("throws NotFoundError for a well-formed but non-existent eventId", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await expect(
      updateEvent(
        testDb.database,
        { action: "cancel", eventId: "00000000-0000-0000-0000-000000000000" },
        context(now),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("completes an event referenced by title alone — the real bug this fixes: referring to an event by name, with no id in hand, previously never actually completed it", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const event = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Call with Lin",
      startsAt: new Date("2026-08-03T01:00:00.000Z"),
      durationMinutes: 30,
    });

    const result = await updateEvent(
      testDb.database,
      { action: "complete", title: "call with lin", actualMinutes: 160 },
      context(now),
    );

    expect(result.eventId).toBe(event.eventId);
    expect(result.status).toBe("completed");
    expect(result.actualMinutes).toBe(160);

    const stored = await getCurrentEvent(testDb.database, event.eventId);
    expect(stored?.status).toBe("completed");
  });

  it("rejects input giving both eventId and title", () => {
    expect(
      updateEventInputSchema.safeParse({ action: "cancel", eventId: "e1", title: "x" }).success,
    ).toBe(false);
  });

  it("rejects input giving neither eventId nor title", () => {
    expect(updateEventInputSchema.safeParse({ action: "cancel" }).success).toBe(false);
  });
});
