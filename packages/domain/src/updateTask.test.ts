import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, insertEventRow, insertTaskRow, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import type { DomainContext } from "./context.js";
import { NotFoundError } from "./errors.js";
import { updateTask, updateTaskInputSchema } from "./updateTask.js";

describe("updateTask (domain)", () => {
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

  it("completes a task and reports no orphaned events when none exist", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Write draft" });

    const result = await updateTask(testDb.database, { action: "complete", taskId: task.taskId }, context(now));

    expect(result.status).toBe("completed");
    expect(result.orphanedEventIds).toEqual([]);
  });

  it("reports orphaned events when completing a task that still has a planned event", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Migrate posts" });
    const event = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Migrate posts session",
      startsAt: new Date("2026-08-05T01:00:00.000Z"),
      durationMinutes: 60,
      taskId: task.taskId,
    });

    const result = await updateTask(testDb.database, { action: "complete", taskId: task.taskId }, context(now));

    expect(result.orphanedEventIds).toEqual([event.eventId]);
  });

  it("is idempotent when completing an already-completed task", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Once" });
    await updateTask(testDb.database, { action: "complete", taskId: task.taskId }, context(now));

    const second = await updateTask(testDb.database, { action: "complete", taskId: task.taskId }, context(now));
    expect(second.status).toBe("completed");
  });

  it("cancels a task", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Not needed" });

    const result = await updateTask(testDb.database, { action: "cancel", taskId: task.taskId }, context(now));
    expect(result.status).toBe("cancelled");
  });

  it("edits a task, carrying forward fields not named in the edit", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Original",
      estimatedMinutes: 120,
    });

    const result = await updateTask(
      testDb.database,
      { action: "edit", taskId: task.taskId, newTitle: "Renamed" },
      context(now),
    );

    expect(result.title).toBe("Renamed");
    expect(result.estimatedMinutes).toBe(120); // carried forward, not dropped
  });

  it("throws NotFoundError for a well-formed but non-existent taskId", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await expect(
      updateTask(
        testDb.database,
        { action: "complete", taskId: "00000000-0000-0000-0000-000000000000" },
        context(now),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("completes a task referenced by title alone — same fix as update_event", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Pick a static site generator" });

    const result = await updateTask(
      testDb.database,
      { action: "complete", title: "pick a static site generator" },
      context(now),
    );

    expect(result.taskId).toBe(task.taskId);
    expect(result.status).toBe("completed");
  });

  it("rejects input giving both taskId and title", () => {
    expect(updateTaskInputSchema.safeParse({ action: "cancel", taskId: "t1", title: "x" }).success).toBe(false);
  });

  it("rejects input giving neither taskId nor title", () => {
    expect(updateTaskInputSchema.safeParse({ action: "cancel" }).success).toBe(false);
  });
});
