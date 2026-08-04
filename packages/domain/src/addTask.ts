import { z } from "zod";
import { resolveDateExpression, type TaskData } from "@assistant/core";
import { insertTaskRow, type Database } from "@assistant/db";
import { MAX_TASK_MINUTES } from "./constants.js";
import type { DomainContext } from "./context.js";
import { resolveDependsOn } from "./taskDependencies.js";
import { toTaskData } from "./taskData.js";

export const addTaskInputSchema = z.object({
  title: z.string().min(1, "title must not be empty").max(200),
  description: z.string().max(2000).optional(),
  estimatedMinutes: z.number().int().positive().max(MAX_TASK_MINUTES).optional(),
  deadline: z.string().min(1).optional(),
  projectId: z.string().uuid().optional(),
  // Titles of tasks that must complete first — see taskDependencies.ts.
  // Never a cycle risk here: this task doesn't exist yet, so nothing can
  // already point to it (assertNoDependencyCycle isn't needed on add).
  dependsOn: z.array(z.string().min(1)).optional(),
});

export type AddTaskInput = z.infer<typeof addTaskInputSchema>;

export async function addTask(
  database: Database,
  input: AddTaskInput,
  context: DomainContext,
): Promise<TaskData> {
  const deadline = input.deadline
    ? resolveDateExpression(input.deadline, context.now, context.ownerTimezone)
    : undefined;

  const dependsOn = input.dependsOn
    ? await resolveDependsOn(database, context.ownerUserId, context.ownerTimezone, input.dependsOn)
    : undefined;

  const row = await insertTaskRow(database, {
    userId: context.ownerUserId,
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    estimatedMinutes: input.estimatedMinutes,
    deadline,
    dependsOn,
  });

  return toTaskData(database, row, []);
}
