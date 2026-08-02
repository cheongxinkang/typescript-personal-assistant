import type { Database } from "../client.js";
import { turnUsage } from "../schema.js";

/**
 * Unused until Stage 4 wires a real chat loop — the schema and this writer
 * exist from Stage 2 per the phase's scope table, recorded on both success
 * and failure once there is a real turn to record.
 */
export async function insertTurnUsage(
  database: Database,
  params: {
    sessionId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    latencyMs: number;
    outcome: "success" | "failure";
    toolCalls?: number;
  },
): Promise<void> {
  await database.db.insert(turnUsage).values(params);
}
