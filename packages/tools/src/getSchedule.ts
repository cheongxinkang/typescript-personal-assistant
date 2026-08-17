import { SCHEDULE_KIND, type ScheduleData } from "@assistant/core";
import { getSchedule, getScheduleInputSchema, type GetScheduleInput } from "@assistant/domain";
import { loadToolPrompt, requireToolField } from "@assistant/prompts";
import type { ToolDefinition } from "./toolDefinition.js";

const prompt = loadToolPrompt("get_schedule");

export type { GetScheduleInput };

export const getScheduleInputShape = {
  start: getScheduleInputSchema.shape.start.describe(requireToolField(prompt, "get_schedule", "start")),
  end: getScheduleInputSchema.shape.end.describe(requireToolField(prompt, "get_schedule", "end")),
  includeCancelled: getScheduleInputSchema.shape.includeCancelled.describe(
    requireToolField(prompt, "get_schedule", "includeCancelled"),
  ),
};

export const getScheduleTool: ToolDefinition<GetScheduleInput, ScheduleData> = {
  name: "get_schedule",
  description: prompt.description,
  inputShape: getScheduleInputShape,
  kind: SCHEDULE_KIND,
  handler: (input, context) =>
    getSchedule(context.database, input, {
      now: context.now,
      ownerTimezone: context.ownerTimezone,
      ownerUserId: context.ownerUserId,
    }),
};
