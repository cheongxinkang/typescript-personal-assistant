import { desc, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { projects, projectsCurrent } from "../schema.js";

export type ProjectRow = typeof projects.$inferSelect;

/**
 * Insert-only (ARCHITECTURE.md §4) — a status or task_generation_status
 * change is a new row sharing `projectId`, built via carryForward by the
 * domain layer (Stage 3/6), not here.
 */
export async function insertProjectRow(
  database: Database,
  params: {
    projectId?: string;
    userId: string;
    title: string;
    description?: string;
    targetDate?: Date;
    status?: ProjectRow["status"];
    taskGenerationStatus?: ProjectRow["taskGenerationStatus"];
  },
): Promise<ProjectRow> {
  const [row] = await database.db
    .insert(projects)
    .values({
      projectId: params.projectId,
      userId: params.userId,
      title: params.title,
      description: params.description,
      targetDate: params.targetDate,
      status: params.status,
      taskGenerationStatus: params.taskGenerationStatus,
    })
    .returning();

  if (!row) {
    throw new Error("Insert did not return a row.");
  }
  return row;
}

/** Every read goes through the fold view — never the base table directly. */
export async function getCurrentProject(
  database: Database,
  projectId: string,
): Promise<ProjectRow | undefined> {
  const [row] = await database.db
    .select()
    .from(projectsCurrent)
    .where(eq(projectsCurrent.projectId, projectId))
    .limit(1);
  return row;
}

/**
 * Every one of the owner's projects, folded, every status.
 * phase_2a-db-visibility.md Requirement 2/7 — all rows, with a defensive
 * `limit`.
 */
export async function listProjectsForOwner(database: Database, userId: string, limit: number): Promise<ProjectRow[]> {
  return database.db
    .select()
    .from(projectsCurrent)
    .where(eq(projectsCurrent.userId, userId))
    .orderBy(desc(projectsCurrent.createdAt))
    .limit(limit);
}
