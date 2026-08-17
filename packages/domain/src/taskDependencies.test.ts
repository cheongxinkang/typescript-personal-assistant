import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, insertTaskRow, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { AmbiguousReferenceError, DependencyCycleError, NotFoundError } from "./errors.js";
import { assertNoDependencyCycle, resolveDependsOn } from "./taskDependencies.js";

describe("taskDependencies (domain)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  describe("resolveDependsOn", () => {
    it("resolves a title to a taskId", async () => {
      const task = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Draft the outline" });

      const resolved = await resolveDependsOn(testDb.database, OWNER_USER_ID, "Asia/Singapore", ["draft the outline"]);

      expect(resolved).toEqual([task.taskId]);
    });

    it("throws NotFoundError for a title matching no open task", async () => {
      await expect(
        resolveDependsOn(testDb.database, OWNER_USER_ID, "Asia/Singapore", ["No such task at all"]),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws AmbiguousReferenceError for a title matching more than one task", async () => {
      await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Duplicate title case" });
      await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Duplicate title case" });

      await expect(
        resolveDependsOn(testDb.database, OWNER_USER_ID, "Asia/Singapore", ["Duplicate title case"]),
      ).rejects.toThrow(AmbiguousReferenceError);
    });
  });

  describe("assertNoDependencyCycle", () => {
    it("is a no-op for a task with no id (add_task — can't already be part of a cycle)", async () => {
      await expect(
        assertNoDependencyCycle(testDb.database, { title: "Brand new task" }, ["anything"]),
      ).resolves.toBeUndefined();
    });

    it("allows a non-cyclic chain (A depends on B depends on C)", async () => {
      const taskC = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Chain task C" });
      const taskB = await insertTaskRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Chain task B",
        dependsOn: [taskC.taskId],
      });
      const taskA = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Chain task A" });

      await expect(
        assertNoDependencyCycle(testDb.database, { taskId: taskA.taskId, title: "Chain task A" }, [taskB.taskId]),
      ).resolves.toBeUndefined();
    });

    it("rejects a three-hop cycle (A -> B -> C -> A)", async () => {
      const taskA = await insertTaskRow(testDb.database, { userId: OWNER_USER_ID, title: "Loop task A" });
      const taskB = await insertTaskRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Loop task B",
        dependsOn: [taskA.taskId],
      });
      const taskC = await insertTaskRow(testDb.database, {
        userId: OWNER_USER_ID,
        title: "Loop task C",
        dependsOn: [taskB.taskId],
      });

      // Completing the loop: A depends on C, but C already (transitively) depends on A.
      await expect(
        assertNoDependencyCycle(testDb.database, { taskId: taskA.taskId, title: "Loop task A" }, [taskC.taskId]),
      ).rejects.toThrow(DependencyCycleError);
    });
  });
});
