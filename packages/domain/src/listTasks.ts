import { z } from "zod";
import type { TaskListData } from "@assistant/core";
import { listTasksForOwner, type Database } from "@assistant/db";
import type { DomainContext } from "./context.js";
import { toTaskData } from "./taskData.js";

export const listTasksInputSchema = z.object({
  status: z.enum(["open", "completed", "cancelled"]).optional(),
});

export type ListTasksInput = z.infer<typeof listTasksInputSchema>;

/**
 * Added during Stage 7's real end-to-end pass, which surfaced a real gap:
 * there was no way to read tasks back at all — only get_schedule (events)
 * and add/update. Defaults to `open`, since "what are my tasks" almost
 * always means the still-outstanding ones; an explicit status widens it.
 */
export async function listTasks(
  database: Database,
  input: ListTasksInput,
  context: DomainContext,
): Promise<TaskListData> {
  const rows = await listTasksForOwner(database, context.ownerUserId, input.status ?? "open");
  return { tasks: rows.map((row) => toTaskData(row, [])) };
}
