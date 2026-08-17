import { z } from "zod";
import { resolveDateExpression, type ProjectData } from "@assistant/core";
import { insertProjectRow, type Database } from "@assistant/db";
import { loadProjectBreakdownSystemPrompt } from "@assistant/prompts";
import type { BatchProvider } from "@assistant/providers";
import { insertBatchJob } from "@assistant/db";
import type { DomainContext } from "./context.js";
import { toProjectData } from "./projectData.js";

export const addProjectInputSchema = z.object({
  title: z.string().min(1, "title must not be empty").max(200),
  description: z.string().max(4000).optional(),
  targetDate: z.string().min(1).optional(),
});

export type AddProjectInput = z.infer<typeof addProjectInputSchema>;

export interface AddProjectDependencies {
  database: Database;
  batchProvider: BatchProvider;
}

function buildBreakdownPrompt(title: string, description: string, targetDate?: Date): string {
  const targetDateLine = targetDate ? `\nTarget date: ${targetDate.toISOString()}` : "";
  return `Project: ${title}\nDescription: ${description}${targetDateLine}`;
}

/**
 * Requirement 24: creating a project is synchronous; breaking it into
 * tasks is asynchronous (constraint 3). A project with **no** description
 * skips generation entirely and is immediately `ready` with zero tasks
 * (Failure/edge-case table) — there's nothing to submit a batch about.
 */
export async function addProject(
  deps: AddProjectDependencies,
  input: AddProjectInput,
  context: DomainContext,
): Promise<ProjectData> {
  const targetDate = input.targetDate
    ? resolveDateExpression(input.targetDate, context.now, context.ownerTimezone)
    : undefined;

  if (!input.description) {
    const row = await insertProjectRow(deps.database, {
      userId: context.ownerUserId,
      title: input.title,
      targetDate,
      status: "active",
      taskGenerationStatus: "ready",
    });
    return toProjectData(row);
  }

  const row = await insertProjectRow(deps.database, {
    userId: context.ownerUserId,
    title: input.title,
    description: input.description,
    targetDate,
    status: "active",
    taskGenerationStatus: "pending",
  });

  const submission = await deps.batchProvider.submit([
    {
      customId: row.projectId,
      systemPrompt: loadProjectBreakdownSystemPrompt(),
      messages: [{ role: "user", content: buildBreakdownPrompt(row.title, input.description, targetDate) }],
    },
  ]);

  await insertBatchJob(deps.database, {
    kind: "project_task_breakdown",
    subjectId: row.projectId,
    providerBatchId: submission.providerBatchId,
  });

  return toProjectData(row);
}
