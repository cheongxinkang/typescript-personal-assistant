import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, insertEventRow, insertTaskRow, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import type { DomainContext } from "./context.js";
import { DependencyCycleError, NotFoundError } from "./errors.js";
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

  it("sets a dependency by title, and carries it forward on an unrelated edit", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Finish module 4" });
    const exam = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Mock exam" });

    const first = await updateTask(
      testDb.database,
      { action: "edit", taskId: exam.taskId, dependsOn: ["Finish module 4"] },
      context(now),
    );
    expect(first.dependsOnTitles).toEqual(["Finish module 4"]);

    const second = await updateTask(
      testDb.database,
      { action: "edit", taskId: exam.taskId, newTitle: "Mock exam (renamed)" },
      context(now),
    );
    expect(second.dependsOnTitles).toEqual(["Finish module 4"]); // carried forward, not dropped
  });

  it("clears dependencies given an explicit empty array", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Finish module 5" });
    const exam = await insertTaskRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "Mock exam 2",
    });
    await updateTask(testDb.database, { action: "edit", taskId: exam.taskId, dependsOn: ["Finish module 5"] }, context(now));

    const result = await updateTask(testDb.database, { action: "edit", taskId: exam.taskId, dependsOn: [] }, context(now));
    expect(result.dependsOnTitles).toEqual([]);
  });

  it("rejects a direct self-dependency as a cycle", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Self-dependent task" });

    await expect(
      updateTask(
        testDb.database,
        { action: "edit", taskId: task.taskId, dependsOn: ["Self-dependent task"] },
        context(now),
      ),
    ).rejects.toThrow(DependencyCycleError);
  });

  it("rejects an indirect cycle (A depends on B, B depends on A)", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const taskA = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Cycle task A" });
    const taskB = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Cycle task B" });

    await updateTask(testDb.database, { action: "edit", taskId: taskB.taskId, dependsOn: ["Cycle task A"] }, context(now));

    await expect(
      updateTask(testDb.database, { action: "edit", taskId: taskA.taskId, dependsOn: ["Cycle task B"] }, context(now)),
    ).rejects.toThrow(DependencyCycleError);
  });

  it("throws NotFoundError for a dependsOn title matching nothing", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Needs a real dependency" });

    await expect(
      updateTask(
        testDb.database,
        { action: "edit", taskId: task.taskId, dependsOn: ["Nonexistent task"] },
        context(now),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects input giving both taskId and title", () => {
    expect(updateTaskInputSchema.safeParse({ action: "cancel", taskId: "t1", title: "x" }).success).toBe(false);
  });

  it("rejects input giving neither taskId nor title", () => {
    expect(updateTaskInputSchema.safeParse({ action: "cancel" }).success).toBe(false);
  });
});
