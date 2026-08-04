import { z } from "zod";
import { resolveDateExpression, type TaskData } from "@assistant/core";
import { carryForward, insertTaskRow, listNonCancelledEventsByTaskId, type Database, type TaskRow } from "@assistant/db";
import { MAX_TASK_MINUTES } from "./constants.js";
import type { DomainContext } from "./context.js";
import { resolveTaskReference } from "./resolveReference.js";
import { toTaskData } from "./taskData.js";

/**
 * `taskId` OR `title` — never both, never neither, enforced by the
 * `.refine()` below. Same reasoning as `update_event`'s identical split —
 * see `resolveReference.ts`. `edit`'s own `title` field (a *new* title to
 * set) and the reference `title` field (which task to act on) share a name
 * at the wire-schema level; the domain schema below keeps them distinct
 * (`title` selects the task, `newTitle` renames it) to avoid exactly that
 * ambiguity.
 */
const referenceShape = {
  taskId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
};

function hasExactlyOneReference(data: { taskId?: string; title?: string }): boolean {
  return (data.taskId ? 1 : 0) + (data.title ? 1 : 0) === 1;
}

export const updateTaskInputSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("complete"), ...referenceShape }),
    z.object({ action: z.literal("cancel"), ...referenceShape }),
    z.object({
      action: z.literal("edit"),
      taskId: z.string().min(1).optional(),
      title: z.string().min(1).optional(),
      newTitle: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).optional(),
      estimatedMinutes: z.number().int().positive().max(MAX_TASK_MINUTES).optional(),
      deadline: z.string().min(1).optional(),
    }),
  ])
  .refine(hasExactlyOneReference, { message: "Provide exactly one of taskId or title." });

export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

function toInsertParams(row: Omit<TaskRow, "rowId" | "createdAt">): Parameters<typeof insertTaskRow>[1] {
  return {
    taskId: row.taskId,
    userId: row.userId,
    projectId: row.projectId ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    estimatedMinutes: row.estimatedMinutes ?? undefined,
    deadline: row.deadline ?? undefined,
    status: row.status,
    source: row.source,
    completedAt: row.completedAt ?? undefined,
  };
}

/**
 * Requirement 9: completing or cancelling a task does not touch its
 * events — `orphanedEventIds` reports them (Requirement 9's edge case)
 * rather than leaving that silent. Every action appends a new row sharing
 * `taskId` via carryForward (Requirement 7), never an UPDATE.
 *
 * Idempotent per the Failure/edge-case table's spirit for events — an
 * already-completed/cancelled task returns its current state rather than
 * appending a no-op revision.
 */
export async function updateTask(
  database: Database,
  input: UpdateTaskInput,
  context: DomainContext,
): Promise<TaskData> {
  const current = await resolveTaskReference(
    database,
    context.ownerUserId,
    { id: input.taskId, title: input.title },
    context.ownerTimezone,
  );

  if (input.action === "complete" && current.status === "completed") {
    return toTaskData(current, await orphanedEventIdsFor(database, current.taskId));
  }
  if (input.action === "cancel" && current.status === "cancelled") {
    return toTaskData(current, []);
  }

  let overrides: Partial<TaskRow>;
  if (input.action === "complete") {
    overrides = { status: "completed", completedAt: context.now };
  } else if (input.action === "cancel") {
    overrides = { status: "cancelled" };
  } else {
    const deadline = input.deadline
      ? resolveDateExpression(input.deadline, context.now, context.ownerTimezone)
      : current.deadline;
    overrides = {
      title: input.newTitle ?? current.title,
      description: input.description ?? current.description,
      estimatedMinutes: input.estimatedMinutes ?? current.estimatedMinutes,
      deadline,
    };
  }

  const carried = carryForward(current, overrides);
  const row = await insertTaskRow(database, toInsertParams(carried));

  const orphanedEventIds =
    input.action === "complete" || input.action === "cancel" ? await orphanedEventIdsFor(database, row.taskId) : [];

  return toTaskData(row, orphanedEventIds);
}

async function orphanedEventIdsFor(database: Database, taskId: string): Promise<string[]> {
  const events = await listNonCancelledEventsByTaskId(database, taskId);
  return events.map((event) => event.eventId);
}
