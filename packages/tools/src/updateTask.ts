import { z } from "zod";
import { TASK_UPDATED_KIND, type TaskData } from "@assistant/core";
import { updateTask, updateTaskInputSchema } from "@assistant/domain";
import { loadToolPrompt, requireToolField } from "@assistant/prompts";
import type { ToolDefinition } from "./toolDefinition.js";

const prompt = loadToolPrompt("update_task");

/**
 * MCP's tool registration takes one flat object shape, not a discriminated
 * union — so the wire schema exposed to the model is a superset of every
 * action's fields, all but `action`/`taskId` optional. The domain layer's
 * `updateTaskInputSchema` (a real `z.discriminatedUnion`) is what actually
 * enforces which fields apply to which action — re-validated in the
 * handler below, not trusted from the flatter shape alone.
 */
export const updateTaskInputShape = {
  action: z.enum(["complete", "cancel", "edit"]).describe(requireToolField(prompt, "update_task", "action")),
  taskId: z.string().min(1).optional().describe(requireToolField(prompt, "update_task", "taskId")),
  title: z.string().min(1).optional().describe(requireToolField(prompt, "update_task", "title")),
  newTitle: z.string().min(1).max(200).optional().describe(requireToolField(prompt, "update_task", "newTitle")),
  description: z.string().max(2000).optional().describe(
    requireToolField(prompt, "update_task", "description"),
  ),
  estimatedMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(requireToolField(prompt, "update_task", "estimatedMinutes")),
  deadline: z.string().min(1).optional().describe(requireToolField(prompt, "update_task", "deadline")),
};

export const updateTaskWireSchema = z.object(updateTaskInputShape);
export type UpdateTaskWireInput = z.infer<typeof updateTaskWireSchema>;

export const updateTaskTool: ToolDefinition<UpdateTaskWireInput, TaskData> = {
  name: "update_task",
  description: prompt.description,
  inputShape: updateTaskInputShape,
  kind: TASK_UPDATED_KIND,
  handler: (input, context) => {
    const validated = updateTaskInputSchema.parse(input);
    return updateTask(context.database, validated, {
      now: context.now,
      ownerTimezone: context.ownerTimezone,
      ownerUserId: context.ownerUserId,
    });
  },
};
