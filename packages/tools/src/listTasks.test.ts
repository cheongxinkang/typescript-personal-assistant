import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { addTaskTool } from "./addTask.js";
import { listTasksTool } from "./listTasks.js";
import type { ToolContext } from "./toolDefinition.js";

describe("listTasksTool.handler", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function context(now: Date): ToolContext {
    return { database: testDb.database, now, ownerTimezone: "Asia/Singapore", ownerUserId: OWNER_USER_ID };
  }

  it("delegates to the domain function and returns the owner's tasks", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await addTaskTool.handler({ title: "Pick a static site generator" }, context(now));

    const result = await listTasksTool.handler({}, context(now));

    expect(result.tasks.some((task) => task.title === "Pick a static site generator")).toBe(true);
  });
});
