import { desc, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { messages } from "../schema.js";

export type MessageRow = typeof messages.$inferSelect;

/**
 * Requirement 5: a duplicate platform_message_id is a no-op, enforced
 * durably by messages_platform_message_id_idx rather than only the
 * in-memory check in packages/channels — a restart forgets the in-memory
 * set, the unique index does not. Returns null on a duplicate rather than
 * throwing, so the caller's happy path doesn't need a try/catch.
 */
export async function insertUserMessage(
  database: Database,
  params: { sessionId: string; content: string; platformMessageId: string },
): Promise<MessageRow | null> {
  const [row] = await database.db
    .insert(messages)
    .values({
      sessionId: params.sessionId,
      role: "user",
      content: params.content,
      platformMessageId: params.platformMessageId,
    })
    .onConflictDoNothing({ target: messages.platformMessageId })
    .returning();

  return row ?? null;
}

/** No platform_message_id — nothing inbound to dedupe against. */
export async function insertAssistantMessage(
  database: Database,
  params: { sessionId: string; content: string },
): Promise<MessageRow> {
  const [row] = await database.db
    .insert(messages)
    .values({ sessionId: params.sessionId, role: "assistant", content: params.content })
    .returning();

  if (!row) {
    throw new Error("Insert did not return a row.");
  }
  return row;
}

/**
 * Requirement 7: the most recent `limit` turns, returned oldest first — a
 * hard truncation, no summarization in this phase.
 */
export async function loadRecentHistory(
  database: Database,
  sessionId: string,
  limit: number,
): Promise<MessageRow[]> {
  const recent = await database.db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return recent.reverse();
}
