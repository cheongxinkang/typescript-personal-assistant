import type { TaskData } from "@assistant/core";
import type { TaskRow } from "@assistant/db";

/** Shared by addTask/updateTask so both build the envelope's `data` the same way. */
export function toTaskData(row: TaskRow, orphanedEventIds: string[]): TaskData {
  return {
    taskId: row.taskId,
    title: row.title,
    description: row.description,
    estimatedMinutes: row.estimatedMinutes,
    deadline: row.deadline ? row.deadline.toISOString() : null,
    status: row.status,
    projectId: row.projectId,
    orphanedEventIds,
  };
}
