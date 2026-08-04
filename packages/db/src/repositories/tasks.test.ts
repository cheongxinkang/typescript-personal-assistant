import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startTestDatabase, type TestDatabase } from "../testing.js";
import { ensureOwnerUser, OWNER_USER_ID } from "./users.js";
import { getCurrentTask, insertTaskRow, listTasksForOwner } from "./tasks.js";

describe("tasks fold view (tasks_current)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns the only row when there is exactly one", async () => {
    const taskId = randomUUID();
    await insertTaskRow(testDb.database, {
      taskId,
      userId: OWNER_USER_ID,
      title: "Pick a static site generator",
      estimatedMinutes: 120,
    });

    const current = await getCurrentTask(testDb.database, taskId);
    expect(current?.title).toBe("Pick a static site generator");
    expect(current?.status).toBe("open");
    expect(current?.source).toBe("user");
  });

  it("folds to the later row when two rows share a task_id — completion", async () => {
    const taskId = randomUUID();
    await insertTaskRow(testDb.database, {
      taskId,
      userId: OWNER_USER_ID,
      title: "Pick a static site generator",
      status: "open",
    });
    const completedAt = new Date("2026-08-04T10:00:00.000Z");
    await insertTaskRow(testDb.database, {
      taskId,
      userId: OWNER_USER_ID,
      title: "Pick a static site generator",
      status: "completed",
      completedAt,
    });

    const current = await getCurrentTask(testDb.database, taskId);
    expect(current?.status).toBe("completed");
    expect(current?.completedAt).toEqual(completedAt);
  });

  it("leaves other task ids untouched by a fold on a different id", async () => {
    const taskIdA = randomUUID();
    const taskIdB = randomUUID();
    await insertTaskRow(testDb.database, { taskId: taskIdA, userId: OWNER_USER_ID, title: "A" });
    await insertTaskRow(testDb.database, { taskId: taskIdB, userId: OWNER_USER_ID, title: "B" });
    await insertTaskRow(testDb.database, {
      taskId: taskIdA,
      userId: OWNER_USER_ID,
      title: "A",
      status: "cancelled",
    });

    expect((await getCurrentTask(testDb.database, taskIdA))?.status).toBe("cancelled");
    expect((await getCurrentTask(testDb.database, taskIdB))?.status).toBe("open");
  });

  it("carries projectId and source across a fold", async () => {
    const taskId = randomUUID();
    const projectId = randomUUID();
    await insertTaskRow(testDb.database, {
      taskId,
      userId: OWNER_USER_ID,
      projectId,
      title: "Migrate existing posts",
      source: "generated",
      estimatedMinutes: 240,
    });
    await insertTaskRow(testDb.database, {
      taskId,
      userId: OWNER_USER_ID,
      projectId,
      title: "Migrate existing posts",
      source: "generated",
      status: "completed",
      completedAt: new Date("2026-08-04T10:00:00.000Z"),
    });

    const current = await getCurrentTask(testDb.database, taskId);
    expect(current?.projectId).toBe(projectId);
    expect(current?.source).toBe("generated");
  });
});

describe("listTasksForOwner", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns every status when no status filter is given — phase_2a-db-visibility.md Requirement 3", async () => {
    const openId = randomUUID();
    const completedId = randomUUID();
    await insertTaskRow(testDb.database, { taskId: openId, userId: OWNER_USER_ID, title: "Open one" });
    await insertTaskRow(testDb.database, {
      taskId: completedId,
      userId: OWNER_USER_ID,
      title: "Completed one",
      status: "completed",
    });

    const rows = await listTasksForOwner(testDb.database, OWNER_USER_ID);

    const statuses = rows.filter((r) => r.taskId === openId || r.taskId === completedId).map((r) => r.status);
    expect(statuses.sort()).toEqual(["completed", "open"]);
  });

  it("applies limit when given, and returns everything when omitted", async () => {
    for (let i = 0; i < 3; i += 1) {
      await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: `Limit test ${i}` });
    }

    const limited = await listTasksForOwner(testDb.database, OWNER_USER_ID, undefined, 1);
    expect(limited).toHaveLength(1);
  });
});
