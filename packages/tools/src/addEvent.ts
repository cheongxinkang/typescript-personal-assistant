import { z } from "zod";
import { resolveDateExpression, type EventCreatedData } from "@assistant/core";
import { insertEventRow } from "@assistant/db";
import { loadToolPrompt, requireToolField } from "@assistant/prompts";
import type { ToolDefinition } from "./toolDefinition.js";

const prompt = loadToolPrompt("add_event");

export interface AddEventInput {
  title: string;
  dateExpression: string;
  durationMinutes?: number;
}

export const addEventInputShape = {
  title: z
    .string()
    .min(1, "title must not be empty")
    .max(200)
    .describe(requireToolField(prompt, "add_event", "title")),
  dateExpression: z.string().min(1).describe(requireToolField(prompt, "add_event", "dateExpression")),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(requireToolField(prompt, "add_event", "durationMinutes")),
};

export const addEventTool: ToolDefinition<AddEventInput, EventCreatedData> = {
  name: "add_event",
  description: prompt.description,
  inputShape: addEventInputShape,
  handler: async (input, context) => {
    // Requirement 21: the backend resolves the expression, never the
    // model. resolveDateExpression throws DateExpressionError on
    // unresolvable input; that's left to propagate — the MCP layer turns a
    // thrown handler error into an isError:true tool result automatically
    // (confirmed empirically before writing this), which is exactly the
    // "clean validation error returned to the model" the requirement asks for.
    const startsAt = resolveDateExpression(input.dateExpression, context.now, context.ownerTimezone);

    const row = await insertEventRow(context.database, {
      userId: context.ownerUserId,
      title: input.title,
      startsAt,
      durationMinutes: input.durationMinutes,
    });

    // Requirement 23: built from the row read back after insert, never
    // from `input` — a model that restates a different title can never
    // have that title win over what was actually stored.
    const result: EventCreatedData = {
      eventId: row.eventId,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      durationMinutes: row.durationMinutes,
    };
    return result;
  },
};
