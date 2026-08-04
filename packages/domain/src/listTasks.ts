import { z } from "zod";
import type { TaskData, TaskListData, TaskListGroup } from "@assistant/core";
import { getCurrentProject, listTasksForOwner, type Database } from "@assistant/db";
import type { DomainContext } from "./context.js";
import { toTaskData } from "./taskData.js";

export const listTasksInputSchema = z.object({
  status: z.enum(["open", "completed", "cancelled"]).optional(),
});

export type ListTasksInput = z.infer<typeof listTasksInputSchema>;

/**
 * Added during Stage 7's real end-to-end pass, which surfaced a real gap:
 * there was no way to read tasks back at all — only get_schedule (events)
 * and add/update. Defaults to `open`, since "what are my tasks" almost
 * always means the still-outstanding ones; an explicit status widens it.
 *
 * Grouped by project rather than returned flat — a flat list mixing several
 * projects' tasks with standalone ones read as an undifferentiated wall of
 * text once there was more than a handful (found during the same pass).
 * Project-less tasks land in one final group so they're never dropped.
 */
export async function listTasks(
  database: Database,
  input: ListTasksInput,
  context: DomainContext,
): Promise<TaskListData> {
  const rows = await listTasksForOwner(database, context.ownerUserId, input.status ?? "open");

  const tasksByProjectId = new Map<string, TaskData[]>();
  const ungrouped: TaskData[] = [];
  for (const row of rows) {
    const task = await toTaskData(database, row, []);
    if (row.projectId) {
      const existing = tasksByProjectId.get(row.projectId);
      if (existing) {
        existing.push(task);
      } else {
        tasksByProjectId.set(row.projectId, [task]);
      }
    } else {
      ungrouped.push(task);
    }
  }

  const projectGroups: TaskListGroup[] = [];
  for (const [projectId, tasks] of tasksByProjectId) {
    const project = await getCurrentProject(database, projectId);
    projectGroups.push({ projectId, projectTitle: project?.title ?? null, tasks });
  }
  projectGroups.sort((a, b) => (a.projectTitle ?? "").localeCompare(b.projectTitle ?? ""));

  const groups = [...projectGroups];
  if (ungrouped.length > 0) {
    groups.push({ projectId: null, projectTitle: null, tasks: ungrouped });
  }

  return { groups };
}
