import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { users } from "../schema.js";

/**
 * The single synthetic owner user for this phase (ARCHITECTURE.md §4:
 * "single synthetic owner user"), addressed by a fixed well-known id rather
 * than looked up, so every caller agrees on identity without a lookup.
 * Widened to real per-user rows in Stage 8.
 */
export const OWNER_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Idempotent upsert, called once at boot — not a static migration-time
 * seed, since OWNER_TIMEZONE is runtime config a migration file can't see
 * (see schema.ts's comment on `users`). Safe to call on every boot.
 */
export async function ensureOwnerUser(database: Database, timezone: string): Promise<void> {
  await database.db
    .insert(users)
    .values({ id: OWNER_USER_ID, timezone })
    .onConflictDoUpdate({ target: users.id, set: { timezone } });
}

export async function getOwnerTimezone(database: Database): Promise<string | undefined> {
  const [row] = await database.db.select().from(users).where(eq(users.id, OWNER_USER_ID)).limit(1);
  return row?.timezone;
}
