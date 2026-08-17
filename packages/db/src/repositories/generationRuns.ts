import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { generationRuns } from "../schema.js";

export type GenerationRunRow = typeof generationRuns.$inferSelect;

export interface OverflowEntry {
  taskId: string;
  reason: string;
}

/** Ordinary mutable — operational state, not domain history. */
export async function insertGenerationRun(
  database: Database,
  params: {
    userId: string;
    horizonStart: Date;
    horizonEnd: Date;
    batchJobId?: string;
    placedCount: number;
    overflow: OverflowEntry[];
  },
): Promise<GenerationRunRow> {
  const [row] = await database.db
    .insert(generationRuns)
    .values({
      userId: params.userId,
      horizonStart: params.horizonStart,
      horizonEnd: params.horizonEnd,
      batchJobId: params.batchJobId,
      placedCount: params.placedCount,
      overflow: JSON.stringify(params.overflow),
    })
    .returning();
  if (!row) {
    throw new Error("Insert did not return a row.");
  }
  return row;
}

export async function getGenerationRun(
  database: Database,
  id: string,
): Promise<GenerationRunRow | undefined> {
  const [row] = await database.db.select().from(generationRuns).where(eq(generationRuns.id, id)).limit(1);
  return row;
}

/** Ordinary mutable — filled in once placement actually runs (Stage 6's apply step). */
export async function updateGenerationRun(
  database: Database,
  id: string,
  fields: { placedCount: number; overflow: OverflowEntry[] },
): Promise<void> {
  await database.db
    .update(generationRuns)
    .set({ placedCount: fields.placedCount, overflow: JSON.stringify(fields.overflow) })
    .where(eq(generationRuns.id, id));
}

/** Parses the row's JSON `overflow` column back into typed entries. */
export function parseOverflow(row: GenerationRunRow): OverflowEntry[] {
  return JSON.parse(row.overflow) as OverflowEntry[];
}
