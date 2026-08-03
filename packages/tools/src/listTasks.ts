import { TASK_LIST_KIND, type TaskListData } from "@assistant/core";
import { listTasks, listTasksInputSchema, type ListTasksInput } from "@assistant/domain";
import { loadToolPrompt, requireToolField } from "@assistant/prompts";
import type { ToolDefinition } from "./toolDefinition.js";

const prompt = loadToolPrompt("list_tasks");

export type { ListTasksInput };

export const listTasksInputShape = {
  status: listTasksInputSchema.shape.status.describe(requireToolField(prompt, "list_tasks", "status")),
};

export const listTasksTool: ToolDefinition<ListTasksInput, TaskListData> = {
  name: "list_tasks",
  description: prompt.description,
  inputShape: listTasksInputShape,
  kind: TASK_LIST_KIND,
  handler: (input, context) =>
    listTasks(context.database, input, {
      now: context.now,
      ownerTimezone: context.ownerTimezone,
      ownerUserId: context.ownerUserId,
    }),
};
