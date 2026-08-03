import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startTestDatabase, type TestDatabase } from "../testing.js";
import { ensureOwnerUser, OWNER_USER_ID } from "./users.js";
import { getCurrentProject, insertProjectRow } from "./projects.js";

describe("projects fold view (projects_current)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns the only row when there is exactly one", async () => {
    const projectId = randomUUID();
    await insertProjectRow(testDb.database, {
      projectId,
      userId: OWNER_USER_ID,
      title: "Rewrite the personal site",
    });

    const current = await getCurrentProject(testDb.database, projectId);
    expect(current?.title).toBe("Rewrite the personal site");
    expect(current?.status).toBe("active");
    expect(current?.taskGenerationStatus).toBe("pending");
  });

  it("folds to the later row when two rows share a project_id", async () => {
    const projectId = randomUUID();
    await insertProjectRow(testDb.database, {
      projectId,
      userId: OWNER_USER_ID,
      title: "Rewrite the personal site",
      taskGenerationStatus: "pending",
    });
    // A later row simulates what Stage 6's generation-status transition
    // will look like — insert-only, never UPDATE.
    await insertProjectRow(testDb.database, {
      projectId,
      userId: OWNER_USER_ID,
      title: "Rewrite the personal site",
      taskGenerationStatus: "ready",
    });

    const current = await getCurrentProject(testDb.database, projectId);
    expect(current?.taskGenerationStatus).toBe("ready");
  });

  it("leaves other project ids untouched by a fold on a different id", async () => {
    const projectIdA = randomUUID();
    const projectIdB = randomUUID();
    await insertProjectRow(testDb.database, { projectId: projectIdA, userId: OWNER_USER_ID, title: "A" });
    await insertProjectRow(testDb.database, { projectId: projectIdB, userId: OWNER_USER_ID, title: "B" });
    await insertProjectRow(testDb.database, {
      projectId: projectIdA,
      userId: OWNER_USER_ID,
      title: "A, revised",
    });

    expect((await getCurrentProject(testDb.database, projectIdA))?.title).toBe("A, revised");
    expect((await getCurrentProject(testDb.database, projectIdB))?.title).toBe("B");
  });
});
