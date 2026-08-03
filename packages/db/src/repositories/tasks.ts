import { eq } from "drizzle-orm";
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
