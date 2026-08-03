import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startTestDatabase, type TestDatabase } from "../testing.js";
import { ensureOwnerUser, OWNER_USER_ID } from "./users.js";
import { getGenerationRun, insertGenerationRun, parseOverflow } from "./generationRuns.js";

describe("generationRuns repository", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("persists the overflow set so it survives past the announcing message", async () => {
    const taskId = randomUUID();
    const run = await insertGenerationRun(testDb.database, {
      userId: OWNER_USER_ID,
      horizonStart: new Date("2026-08-03T00:00:00.000Z"),
      horizonEnd: new Date("2026-08-10T00:00:00.000Z"),
      placedCount: 3,
      overflow: [{ taskId, reason: "no_free_interval" }],
    });

    const fetched = await getGenerationRun(testDb.database, run.id);
    expect(fetched?.placedCount).toBe(3);
    expect(parseOverflow(fetched!)).toEqual([{ taskId, reason: "no_free_interval" }]);
  });

  it("defaults to an empty overflow set", async () => {
    const run = await insertGenerationRun(testDb.database, {
      userId: OWNER_USER_ID,
      horizonStart: new Date("2026-08-03T00:00:00.000Z"),
      horizonEnd: new Date("2026-08-10T00:00:00.000Z"),
      placedCount: 5,
      overflow: [],
    });
    expect(parseOverflow(run)).toEqual([]);
  });
});
