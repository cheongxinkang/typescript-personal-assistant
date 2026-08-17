import { SCHEDULE_CONFIRMED_KIND, type ScheduleConfirmedData } from "@assistant/core";
import { confirmSchedule, confirmScheduleInputSchema, type ConfirmScheduleInput } from "@assistant/domain";
import { loadToolPrompt, requireToolField } from "@assistant/prompts";
import type { ToolDefinition } from "./toolDefinition.js";

const prompt = loadToolPrompt("confirm_schedule");

export type { ConfirmScheduleInput };

export const confirmScheduleInputShape = {
  generationRunId: confirmScheduleInputSchema.shape.generationRunId.describe(
    requireToolField(prompt, "confirm_schedule", "generationRunId"),
  ),
};

export const confirmScheduleTool: ToolDefinition<ConfirmScheduleInput, ScheduleConfirmedData> = {
  name: "confirm_schedule",
  description: prompt.description,
  inputShape: confirmScheduleInputShape,
  kind: SCHEDULE_CONFIRMED_KIND,
  handler: (input, context) =>
    confirmSchedule(context.database, input, {
      now: context.now,
      ownerTimezone: context.ownerTimezone,
      ownerUserId: context.ownerUserId,
    }),
};
