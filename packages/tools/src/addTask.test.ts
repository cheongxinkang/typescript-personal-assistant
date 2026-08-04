import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { addTaskTool } from "./addTask.js";
import type { ToolContext } from "./toolDefinition.js";

describe("addTaskTool.handler", () => {
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

  it("delegates to the domain function and returns the created task", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const result = await addTaskTool.handler({ title: "Pick a static site generator" }, context(now));
    expect(result.title).toBe("Pick a static site generator");
    expect(result.status).toBe("open");
  });

  it("resolves dependsOn by title through the flat wire shape — the real MCP call shape", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await addTaskTool.handler({ title: "Finish module 4" }, context(now));

    const result = await addTaskTool.handler(
      { title: "Mock exam", dependsOn: ["Finish module 4"] },
      context(now),
    );

    expect(result.dependsOnTitles).toEqual(["Finish module 4"]);
  });
});
