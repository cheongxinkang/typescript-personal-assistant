import { GENERATION_SUBMITTED_KIND, type GenerationSubmittedData } from "@assistant/core";
import {
  generateSchedule,
  generateScheduleInputSchema,
  type GenerateScheduleInput,
} from "@assistant/domain";
import { loadToolPrompt, requireToolField } from "@assistant/prompts";
import type { ToolDefinition } from "./toolDefinition.js";

const prompt = loadToolPrompt("generate_schedule");

export type { GenerateScheduleInput };

export const generateScheduleInputShape = {
  horizonDays: generateScheduleInputSchema.shape.horizonDays.describe(
    requireToolField(prompt, "generate_schedule", "horizonDays"),
  ),
};

export const generateScheduleTool: ToolDefinition<GenerateScheduleInput, GenerationSubmittedData> = {
  name: "generate_schedule",
  description: prompt.description,
  inputShape: generateScheduleInputShape,
  kind: GENERATION_SUBMITTED_KIND,
  // async — see addProject.ts's identical comment on why this can't be a
  // plain arrow when the guard clause throws before any promise exists.
  handler: async (input, context) => {
    if (!context.batchProvider) {
      throw new Error("generate_schedule requires a batchProvider in ToolContext.");
    }
    return generateSchedule(
      { database: context.database, batchProvider: context.batchProvider },
      input,
      {
        now: context.now,
        ownerTimezone: context.ownerTimezone,
        ownerUserId: context.ownerUserId,
      },
    );
  },
};
