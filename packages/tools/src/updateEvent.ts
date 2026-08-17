import { z } from "zod";
import { EVENT_UPDATED_KIND, type EventUpdatedData } from "@assistant/core";
import { updateEvent, updateEventInputSchema } from "@assistant/domain";
import { loadToolPrompt, requireToolField } from "@assistant/prompts";
import type { ToolDefinition } from "./toolDefinition.js";

const prompt = loadToolPrompt("update_event");

/** Same flat-wire/discriminated-domain split as update_task — see its doc. */
export const updateEventInputShape = {
  action: z
    .enum(["complete", "cancel", "move", "split"])
    .describe(requireToolField(prompt, "update_event", "action")),
  eventId: z.string().min(1).describe(requireToolField(prompt, "update_event", "eventId")),
  actualMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(requireToolField(prompt, "update_event", "actualMinutes")),
  dateExpression: z
    .string()
    .min(1)
    .optional()
    .describe(requireToolField(prompt, "update_event", "dateExpression")),
  completedMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(requireToolField(prompt, "update_event", "completedMinutes")),
};

export const updateEventWireSchema = z.object(updateEventInputShape);
export type UpdateEventWireInput = z.infer<typeof updateEventWireSchema>;

export const updateEventTool: ToolDefinition<UpdateEventWireInput, EventUpdatedData> = {
  name: "update_event",
  description: prompt.description,
  inputShape: updateEventInputShape,
  kind: EVENT_UPDATED_KIND,
  handler: (input, context) => {
    const validated = updateEventInputSchema.parse(input);
    return updateEvent(context.database, validated, {
      now: context.now,
      ownerTimezone: context.ownerTimezone,
      ownerUserId: context.ownerUserId,
      dayShape: context.dayShape,
    });
  },
};
