import { getCurrentTask, type Database, type TaskRow } from "@assistant/db";
import { DependencyCycleError } from "./errors.js";
import { resolveTaskReference } from "./resolveReference.js";

/**
 * Resolves each `dependsOn` entry the owner names by title — the same
 * title-based resolution `update_event`/`update_task`'s own reference
 * field already uses (`resolveTaskReference`), so the owner never has to
 * know or supply an id. A bad title surfaces as the same
 * `NotFoundError`/`AmbiguousReferenceError` that reference resolution
 * already produces, fed back to the model as a clarifying question.
 */
export async function resolveDependsOn(
  database: Database,
  userId: string,
  timezone: string,
  refs: readonly string[],
): Promise<string[]> {
  const resolved: string[] = [];
  for (const ref of refs) {
    const task = await resolveTaskReference(database, userId, { title: ref }, timezone);
    resolved.push(task.taskId);
  }
  return resolved;
}

/**
 * Walks forward from `currentId` through `dependsOn` edges looking for
 * `targetTaskId`. Returns the chain of rows from `currentId` down to (and
 * including) the target's own row if found, so the caller can render a
 * readable "A -> B -> A" message. `visited` is shared across sibling calls
 * (one per new dependency) as a plain reachability memo — a node already
 * explored with no path to the target won't have one on a second visit
 * either, so it's safe to skip.
 */
async function findCyclePath(
  database: Database,
  targetTaskId: string,
  currentId: string,
  visited: Set<string>,
): Promise<TaskRow[] | null> {
  if (visited.has(currentId)) {
    return null;
  }
  visited.add(currentId);

  const row = await getCurrentTask(database, currentId);
  if (!row) {
    return null;
  }
  if (row.taskId === targetTaskId) {
    return [row];
  }
  for (const nextId of row.dependsOn) {
    const found = await findCyclePath(database, targetTaskId, nextId, visited);
    if (found) {
      return [row, ...found];
    }
  }
  return null;
}

/**
 * Rejects a `dependsOn` list that would make `task` (transitively) depend
 * on itself. A brand-new task (`task.taskId` undefined — `add_task`) can
 * never be part of an existing cycle: it isn't in the database yet, so
 * nothing can already point to it. Only `update_task`'s `edit` action,
 * naming an id that already exists, needs the walk.
 */
export async function assertNoDependencyCycle(
  database: Database,
  task: { taskId?: string; title: string },
  dependsOn: readonly string[],
): Promise<void> {
  if (!task.taskId) {
    return;
  }
  const taskId = task.taskId;
  const visited = new Set<string>();
  for (const depId of dependsOn) {
    const cycle = await findCyclePath(database, taskId, depId, visited);
    if (cycle) {
      throw new DependencyCycleError(task.title, [task.title, ...cycle.map((row) => row.title)]);
    }
  }
}
