import { formatDateTime, TASK_LIST_KIND, type TaskListData } from "@assistant/core";
import type { Renderer, RenderContext } from "./registry.js";

export const renderTaskList: Renderer<TaskListData> = (data: TaskListData, context: RenderContext) => {
  if (data.tasks.length === 0) {
    return "No tasks.";
  }
  const lines = data.tasks.map((task) => {
    const deadlineNote = task.deadline ? ` — due ${formatDateTime(new Date(task.deadline), context.timezone)}` : "";
    return `  ${task.title}${deadlineNote}`;
  });
  return lines.join("\n");
};

export { TASK_LIST_KIND };
