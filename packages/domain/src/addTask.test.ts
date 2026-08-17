import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { addTask, addTaskInputSchema } from "./addTask.js";
import type { DomainContext } from "./context.js";

describe("addTask (domain)", () => {
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

  it("creates a task with no deadline and no project", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const result = await addTask(testDb.database, { title: "Pick a static site generator" }, context(now));

    expect(result.title).toBe("Pick a static site generator");
    expect(result.status).toBe("open");
    expect(result.deadline).toBeNull();
    expect(result.projectId).toBeNull();
    expect(result.orphanedEventIds).toEqual([]);
  });

  it("resolves a deadline date expression", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z"); // Sunday, 12:00 SGT
    const result = await addTask(
      testDb.database,
      { title: "Ship the draft", deadline: "tomorrow 18:00" },
      context(now),
    );

    expect(result.deadline).toBe("2026-08-03T10:00:00.000Z"); // 2026-08-03T18:00 SGT
  });

  describe("addTaskInputSchema", () => {
    it("rejects an empty title", () => {
      expect(addTaskInputSchema.safeParse({ title: "" }).success).toBe(false);
    });

    it("rejects an estimate over MAX_TASK_MINUTES", () => {
      expect(addTaskInputSchema.safeParse({ title: "x", estimatedMinutes: 481 }).success).toBe(false);
    });

    it("accepts a bare title", () => {
      expect(addTaskInputSchema.safeParse({ title: "x" }).success).toBe(true);
    });
  });
});
