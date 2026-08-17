import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { FakeBatchProvider } from "@assistant/providers";
import { addProjectTool } from "./addProject.js";
import type { ToolContext } from "./toolDefinition.js";

describe("addProjectTool.handler", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function context(now: Date, batchProvider: FakeBatchProvider): ToolContext {
    return {
      database: testDb.database,
      now,
      ownerTimezone: "Asia/Singapore",
      ownerUserId: OWNER_USER_ID,
      batchProvider,
    };
  }

  it("delegates to the domain function and returns the created project", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const provider = new FakeBatchProvider();
    const result = await addProjectTool.handler({ title: "Empty shell" }, context(now, provider));
    expect(result.title).toBe("Empty shell");
    expect(result.taskGenerationStatus).toBe("ready");
  });

  it("throws if batchProvider is missing from context", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await expect(
      addProjectTool.handler(
        { title: "x" },
        { database: testDb.database, now, ownerTimezone: "Asia/Singapore", ownerUserId: OWNER_USER_ID },
      ),
    ).rejects.toThrow();
  });
});
