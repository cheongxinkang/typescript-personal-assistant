import { formatDateTime, TASK_ADDED_KIND, TASK_UPDATED_KIND, type TaskData } from "@assistant/core";
import type { Renderer, RenderContext } from "./registry.js";

function orphanNote(data: TaskData): string {
  if (data.orphanedEventIds.length === 0) {
    return "";
  }
  const count = data.orphanedEventIds.length;
  return ` Note: ${count === 1 ? "an event" : `${count} events`} still on your schedule for this task ${count === 1 ? "was" : "were"} left untouched.`;
}

export const renderTaskAdded: Renderer<TaskData> = (data: TaskData, context: RenderContext) => {
  const deadlineNote = data.deadline ? ` — due ${formatDateTime(new Date(data.deadline), context.timezone)}` : "";
  return `Added task: ${data.title}${deadlineNote}.`;
};

export const renderTaskUpdated: Renderer<TaskData> = (data: TaskData) => {
  if (data.status === "completed") {
    return `Marked "${data.title}" complete.${orphanNote(data)}`;
  }
  if (data.status === "cancelled") {
    return `Cancelled task: ${data.title}.${orphanNote(data)}`;
  }
  return `Updated task: ${data.title}.`;
};

export { TASK_ADDED_KIND, TASK_UPDATED_KIND };
