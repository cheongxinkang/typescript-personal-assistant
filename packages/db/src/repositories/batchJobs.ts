import { eq, inArray } from "drizzle-orm";
import type { Database } from "../client.js";
import { batchJobs } from "../schema.js";

export type BatchJobRow = typeof batchJobs.$inferSelect;

const NON_TERMINAL_STATUSES = ["submitted", "polling"] as const;

/** Ordinary mutable (ARCHITECTURE.md §4) — operational state, real UPDATEs allowed. */
export async function insertBatchJob(
  database: Database,
  params: {
    kind: BatchJobRow["kind"];
    subjectId: string;
    providerBatchId: string;
    /** Test-only override — production always lets the column default to now(). */
    submittedAt?: Date;
  },
): Promise<BatchJobRow> {
  const [row] = await database.db
    .insert(batchJobs)
    .values({
      kind: params.kind,
      subjectId: params.subjectId,
      providerBatchId: params.providerBatchId,
      submittedAt: params.submittedAt,
    })
    .returning();
  if (!row) {
    throw new Error("Insert did not return a row.");
  }
  return row;
}

export async function getBatchJob(database: Database, id: string): Promise<BatchJobRow | undefined> {
  const [row] = await database.db.select().from(batchJobs).where(eq(batchJobs.id, id)).limit(1);
  return row;
}

/** Every non-terminal job the poller needs to check this tick. */
export async function listNonTerminalBatchJobs(database: Database): Promise<BatchJobRow[]> {
  return database.db.select().from(batchJobs).where(inArray(batchJobs.status, [...NON_TERMINAL_STATUSES]));
}

/** Jobs the poller has confirmed finished processing but Stage 6's apply step hasn't touched yet. */
export async function listEndedBatchJobs(database: Database): Promise<BatchJobRow[]> {
  return database.db.select().from(batchJobs).where(eq(batchJobs.status, "ended"));
}

export async function updateBatchJob(
  database: Database,
  id: string,
  fields: Partial<{
    status: BatchJobRow["status"];
    attempts: number;
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
    failureCategory: string;
    endedAt: Date;
    appliedAt: Date;
  }>,
): Promise<void> {
  await database.db.update(batchJobs).set(fields).where(eq(batchJobs.id, id));
}
