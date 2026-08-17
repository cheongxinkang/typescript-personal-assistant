import { formatDateTime, TASK_LIST_KIND, type TaskListData } from "@assistant/core";
import type { Renderer, RenderContext } from "./registry.js";

/**
 * One heading per project (title order, per the domain layer's sort),
 * project-less tasks under a shared "Tasks" heading last — a flat list
 * stopped being readable once more than one project's tasks were mixed
 * with standalone ones (Stage 7 hardening).
 */
export const renderTaskList: Renderer<TaskListData> = (data: TaskListData, context: RenderContext) => {
  if (data.groups.length === 0) {
    return "No tasks.";
  }
  const sections = data.groups.map((group) => {
    const heading = group.projectTitle ?? "Tasks";
    const lines = group.tasks.map((task) => {
      const deadlineNote = task.deadline ? ` — due ${formatDateTime(new Date(task.deadline), context.timezone)}` : "";
      return `* ${task.title}${deadlineNote}`;
    });
    return `# ${heading}\n\n${lines.join("\n")}`;
  });
  return sections.join("\n\n");
};

export { TASK_LIST_KIND };
