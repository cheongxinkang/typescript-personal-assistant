import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, insertTaskRow, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { updateTaskTool } from "./updateTask.js";
import type { ToolContext } from "./toolDefinition.js";

describe("updateTaskTool.handler", () => {
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

  it("re-validates the flat wire input against the discriminated domain schema and completes a task", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Write draft" });

    const result = await updateTaskTool.handler(
      { action: "complete", taskId: task.taskId },
      context(now),
    );

    expect(result.status).toBe("completed");
  });

  it("resolves by title through the flat wire shape — the real MCP call shape", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Pick a static site generator" });

    const result = await updateTaskTool.handler(
      { action: "complete", title: "pick a static site generator" },
      context(now),
    );

    expect(result.taskId).toBe(task.taskId);
    expect(result.status).toBe("completed");
  });

  it("sets a dependency by title through the flat wire shape — the real MCP call shape", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Finish module 4" });
    const exam = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Mock exam" });

    const result = await updateTaskTool.handler(
      { action: "edit", taskId: exam.taskId, dependsOn: ["Finish module 4"] },
      context(now),
    );

    expect(result.dependsOnTitles).toEqual(["Finish module 4"]);
  });
});
