import { TASK_ADDED_KIND, type TaskData } from "@assistant/core";
import { addTask, addTaskInputSchema, type AddTaskInput } from "@assistant/domain";
import { loadToolPrompt, requireToolField } from "@assistant/prompts";
import type { ToolDefinition } from "./toolDefinition.js";

const prompt = loadToolPrompt("add_task");

export type { AddTaskInput };

export const addTaskInputShape = {
  title: addTaskInputSchema.shape.title.describe(requireToolField(prompt, "add_task", "title")),
  description: addTaskInputSchema.shape.description.describe(
    requireToolField(prompt, "add_task", "description"),
  ),
  estimatedMinutes: addTaskInputSchema.shape.estimatedMinutes.describe(
    requireToolField(prompt, "add_task", "estimatedMinutes"),
  ),
  deadline: addTaskInputSchema.shape.deadline.describe(requireToolField(prompt, "add_task", "deadline")),
  projectId: addTaskInputSchema.shape.projectId.describe(requireToolField(prompt, "add_task", "projectId")),
};

export const addTaskTool: ToolDefinition<AddTaskInput, TaskData> = {
  name: "add_task",
  description: prompt.description,
  inputShape: addTaskInputShape,
  kind: TASK_ADDED_KIND,
  handler: (input, context) =>
    addTask(context.database, input, {
      now: context.now,
      ownerTimezone: context.ownerTimezone,
      ownerUserId: context.ownerUserId,
    }),
};
