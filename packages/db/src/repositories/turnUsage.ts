import { desc, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { turnUsage } from "../schema.js";

export type TurnUsageRow = typeof turnUsage.$inferSelect;

/** Wired into chat-loop's runTurn from Stage 4, recorded on both success and failure. */
export async function insertTurnUsage(
  database: Database,
  params: {
    sessionId: string;
    provider: string;
    model: string;
    // Null on a failed call — there is no usage to report.
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens?: number;
    latencyMs: number;
    outcome: "success" | "failure";
    toolCalls?: number;
  },
): Promise<void> {
  await database.db.insert(turnUsage).values(params);
}

/**
 * Ordinary mutable rows (ARCHITECTURE.md §4), not folded — every row is its
 * own complete record of one turn. phase_2a-db-visibility.md Requirement 6:
 * newest-first, windowed with a defensive `limit`.
 */
export async function listRecentTurnUsage(
  database: Database,
  sessionId: string,
  limit: number,
): Promise<TurnUsageRow[]> {
  return database.db
    .select()
    .from(turnUsage)
    .where(eq(turnUsage.sessionId, sessionId))
    .orderBy(desc(turnUsage.createdAt))
    .limit(limit);
}
