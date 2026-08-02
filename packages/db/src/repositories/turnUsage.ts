import type { Database } from "../client.js";
import { turnUsage } from "../schema.js";

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
