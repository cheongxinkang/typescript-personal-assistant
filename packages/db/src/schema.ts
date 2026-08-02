import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  pgView,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { desc } from "drizzle-orm";

/**
 * users -> sessions -> messages from the first migration, with one
 * synthetic owner seeded at boot (see repositories/users.ts — not a static
 * migration-time seed, since OWNER_TIMEZONE is runtime config and a
 * migration can't know it without going stale the moment the owner changes
 * it). See phase-1-vertical-slice.md's Data model section.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  timezone: text("timezone").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    // Widened beyond "discord" in Stage 8 (Telegram, web).
    channelType: text("channel_type").notNull(),
    channelId: text("channel_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sessions_channel_type_channel_id_idx").on(table.channelType, table.channelId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    // Requirement 5's idempotency key. Null for assistant-authored rows,
    // which have no platform-native message id to dedupe against.
    platformMessageId: text("platform_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("messages_platform_message_id_idx").on(table.platformMessageId),
    index("messages_session_id_created_at_idx").on(table.sessionId, table.createdAt),
  ],
);

/**
 * Insert-only per ARCHITECTURE.md §4's classification — never UPDATE, never
 * DELETE outside retention. `eventId` is the fold key (Requirement 25);
 * `rowId` is only this row's own identity. Phase 1 only ever inserts (no
 * add_event tool until Stage 5), but the table, the fold view below, and
 * the fold test all exist from this stage.
 */
export const events = pgTable(
  "events",
  {
    rowId: uuid("row_id").primaryKey().defaultRandom(),
    // Server-generated on first insert (Requirement 25) — a future edit
    // supplies the existing eventId explicitly to append a new row under
    // the same fold identity; a brand-new event omits it and gets one.
    eventId: uuid("event_id").notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    // Backend-resolved (Requirement 21) — never model-supplied.
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes"),
    status: text("status", { enum: ["planned"] }).notNull().default("planned"),
    sourceMessageId: uuid("source_message_id").references(() => messages.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("events_event_id_idx").on(table.eventId)],
);

export const turnUsage = pgTable("turn_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  provider: text("provider").notNull(),
  // The provider's configured model even on failure (no response to read
  // one from) — see packages/providers's LLMProvider.model.
  model: text("model").notNull(),
  // Null on a failed call — there is no usage to report when the provider
  // never returned. Always present on success.
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  latencyMs: integer("latency_ms").notNull(),
  outcome: text("outcome", { enum: ["success", "failure"] }).notNull(),
  toolCalls: integer("tool_calls").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The fold: latest row per event_id. Every read goes through this view —
 * see phase-1-vertical-slice.md's "no application code reads the base
 * table directly" rule. `DISTINCT ON` ties broken by createdAt then rowId
 * so a same-instant double-write is still deterministic.
 */
export const eventsCurrent = pgView("events_current").as((qb) =>
  qb
    .selectDistinctOn([events.eventId])
    .from(events)
    .orderBy(events.eventId, desc(events.createdAt), desc(events.rowId)),
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  events: many(events),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  messages: many(messages),
  turnUsage: many(turnUsage),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, { fields: [messages.sessionId], references: [sessions.id] }),
}));
