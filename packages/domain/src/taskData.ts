import type { TaskData } from "@assistant/core";
import { getCurrentTask, type Database, type TaskRow } from "@assistant/db";

/**
 * Shared by addTask/updateTask so both build the envelope's `data` the
 * same way. Resolves `dependsOn` ids back to titles for the reply — a
 * dependency that referenced a task since renamed or removed is silently
 * skipped here, the same "stale reference, not an error" treatment
 * `orphanedEventIds` already gives a since-cancelled event.
 */
export async function toTaskData(database: Database, row: TaskRow, orphanedEventIds: string[]): Promise<TaskData> {
  const dependsOnTitles: string[] = [];
  for (const dependsOnId of row.dependsOn) {
    const dependency = await getCurrentTask(database, dependsOnId);
    if (dependency) {
      dependsOnTitles.push(dependency.title);
    }
  }

  return {
    taskId: row.taskId,
    title: row.title,
    description: row.description,
    estimatedMinutes: row.estimatedMinutes,
    deadline: row.deadline ? row.deadline.toISOString() : null,
    status: row.status,
    projectId: row.projectId,
    orphanedEventIds,
    dependsOnTitles,
  };
}
