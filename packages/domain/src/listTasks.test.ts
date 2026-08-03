import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { addTask } from "./addTask.js";
import type { DomainContext } from "./context.js";
import { listTasks, listTasksInputSchema } from "./listTasks.js";
import { updateTask } from "./updateTask.js";

describe("listTasks (domain)", () => {
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

  it("defaults to open tasks only", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const open = await addTask(testDb.database, { title: "Stay open" }, context(now));
    const toComplete = await addTask(testDb.database, { title: "Will be completed" }, context(now));
    await updateTask(testDb.database, { action: "complete", taskId: toComplete.taskId }, context(now));

    const result = await listTasks(testDb.database, {}, context(now));

    const titles = result.tasks.map((task) => task.title);
    expect(titles).toContain(open.title);
    expect(titles).not.toContain(toComplete.title);
  });

  it("narrows to a specific status when given", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const toCancel = await addTask(testDb.database, { title: "Will be cancelled" }, context(now));
    await updateTask(testDb.database, { action: "cancel", taskId: toCancel.taskId }, context(now));

    const result = await listTasks(testDb.database, { status: "cancelled" }, context(now));

    expect(result.tasks.some((task) => task.taskId === toCancel.taskId)).toBe(true);
    expect(result.tasks.every((task) => task.status === "cancelled")).toBe(true);
  });

  describe("listTasksInputSchema", () => {
    it("accepts an empty input", () => {
      expect(listTasksInputSchema.safeParse({}).success).toBe(true);
    });

    it("rejects an invalid status", () => {
      expect(listTasksInputSchema.safeParse({ status: "bogus" }).success).toBe(false);
    });
  });
});
