import { PROJECT_ADDED_KIND, type ProjectData } from "@assistant/core";
import { addProject, addProjectInputSchema, type AddProjectInput } from "@assistant/domain";
import { loadToolPrompt, requireToolField } from "@assistant/prompts";
import type { ToolDefinition } from "./toolDefinition.js";

const prompt = loadToolPrompt("add_project");

export type { AddProjectInput };

export const addProjectInputShape = {
  title: addProjectInputSchema.shape.title.describe(requireToolField(prompt, "add_project", "title")),
  description: addProjectInputSchema.shape.description.describe(
    requireToolField(prompt, "add_project", "description"),
  ),
  targetDate: addProjectInputSchema.shape.targetDate.describe(
    requireToolField(prompt, "add_project", "targetDate"),
  ),
};

export const addProjectTool: ToolDefinition<AddProjectInput, ProjectData> = {
  name: "add_project",
  description: prompt.description,
  inputShape: addProjectInputShape,
  kind: PROJECT_ADDED_KIND,
  // async, not a plain arrow returning a promise: the missing-batchProvider
  // check must throw *inside* an async function so it becomes a rejected
  // promise, not a synchronous throw the caller's `await` never gets a
  // chance to catch as a rejection.
  handler: async (input, context) => {
    if (!context.batchProvider) {
      throw new Error("add_project requires a batchProvider in ToolContext.");
    }
    return addProject(
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
