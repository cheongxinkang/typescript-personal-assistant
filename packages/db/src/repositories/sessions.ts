import { and, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { sessions } from "../schema.js";

export type SessionRow = typeof sessions.$inferSelect;

/**
 * A Discord channel maps to exactly one session (Requirement 6). Idempotent
 * by the sessions_channel_type_channel_id_idx unique index.
 */
export async function findOrCreateSession(
  database: Database,
  params: { userId: string; channelType: string; channelId: string },
): Promise<SessionRow> {
  const [existing] = await database.db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.channelType, params.channelType), eq(sessions.channelId, params.channelId)),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await database.db
    .insert(sessions)
    .values({
      userId: params.userId,
      channelType: params.channelType,
      channelId: params.channelId,
    })
    .onConflictDoNothing({ target: [sessions.channelType, sessions.channelId] })
    .returning();

  if (created) {
    return created;
  }

  // Lost a race with a concurrent creator — the row now exists, read it back.
  const [row] = await database.db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.channelType, params.channelType), eq(sessions.channelId, params.channelId)),
    )
    .limit(1);

  if (!row) {
    throw new Error("Session creation raced and the row still could not be found.");
  }
  return row;
}
