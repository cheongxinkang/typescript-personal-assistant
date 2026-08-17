import { and, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { tasks, tasksCurrent } from "../schema.js";

export type TaskRow = typeof tasks.$inferSelect;

/**
 * Insert-only (ARCHITECTURE.md §4) — completion, cancellation, or an edit is
 * a new row sharing `taskId`, built via carryForward by the domain layer
 * (Stage 3), not here.
 */
export async function insertTaskRow(
  database: Database,
  params: {
    taskId?: string;
    userId: string;
    projectId?: string;
    title: string;
    description?: string;
    estimatedMinutes?: number;
    deadline?: Date;
    status?: TaskRow["status"];
    source?: TaskRow["source"];
    completedAt?: Date;
  },
): Promise<TaskRow> {
  const [row] = await database.db
    .insert(tasks)
    .values({
      taskId: params.taskId,
      userId: params.userId,
      projectId: params.projectId,
      title: params.title,
      description: params.description,
      estimatedMinutes: params.estimatedMinutes,
      deadline: params.deadline,
      status: params.status,
      source: params.source,
      completedAt: params.completedAt,
    })
    .returning();

  if (!row) {
    throw new Error("Insert did not return a row.");
  }
  return row;
}

/** Every read goes through the fold view — never the base table directly. */
export async function getCurrentTask(database: Database, taskId: string): Promise<TaskRow | undefined> {
  const [row] = await database.db
    .select()
    .from(tasksCurrent)
    .where(eq(tasksCurrent.taskId, taskId))
    .limit(1);
  return row;
}

/**
 * Every open task for the owner, folded. Whether one is "scheduled" is
 * computed by the caller from `listNonCancelledEventsByTaskId`
 * (Requirement 20) — never stored here, so this alone is not the
 * candidate set for generation.
 */
export async function listOpenTasks(database: Database, userId: string): Promise<TaskRow[]> {
  return database.db
    .select()
    .from(tasksCurrent)
    .where(and(eq(tasksCurrent.userId, userId), eq(tasksCurrent.status, "open")));
}

/**
 * Every one of the owner's tasks, folded, optionally narrowed to a single
 * status — added during Stage 7's real end-to-end pass, which surfaced
 * that nothing let the owner read tasks back at all (only add/update).
 */
export async function listTasksForOwner(
  database: Database,
  userId: string,
  status?: TaskRow["status"],
): Promise<TaskRow[]> {
  const conditions = [eq(tasksCurrent.userId, userId)];
  if (status) {
    conditions.push(eq(tasksCurrent.status, status));
  }
  return database.db
    .select()
    .from(tasksCurrent)
    .where(and(...conditions));
}
