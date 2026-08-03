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
});
