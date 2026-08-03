import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { FakeBatchProvider } from "@assistant/providers";
import { addProject } from "./addProject.js";
import type { DomainContext } from "./context.js";

describe("addProject (domain)", () => {
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

  it("creates a project with no description as immediately ready — no batch submitted", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const provider = new FakeBatchProvider(); // would throw if submit() were called
    const result = await addProject({ database: testDb.database, batchProvider: provider }, { title: "Empty shell" }, context(now));

    expect(result.taskGenerationStatus).toBe("ready");
    expect(provider.submittedBatches).toHaveLength(0);
  });

  it("creates a project with a description as pending and submits exactly one batch", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const provider = new FakeBatchProvider();
    provider.scriptNextBatch(
      [{ status: "in_progress", requestCounts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 }, endedAt: null }],
      [],
    );

    const result = await addProject(
      { database: testDb.database, batchProvider: provider },
      { title: "Rewrite the personal site", description: "A static site with a blog." },
      context(now),
    );

    expect(result.taskGenerationStatus).toBe("pending");
    expect(provider.submittedBatches).toHaveLength(1);
    expect(provider.submittedBatches[0]).toHaveLength(1);
  });
});
