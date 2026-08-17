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
 * Insert-only per ARCHITECTURE.md §4 — a project revision (status change,
 * task_generation_status transition) is a new row sharing `projectId`,
 * never an UPDATE. See phase-2-tools.md Requirement 5.
 */
export const projects = pgTable(
  "projects",
  {
    rowId: uuid("row_id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    // Backend-resolved from a date expression, like events.startsAt.
    targetDate: timestamp("target_date", { withTimezone: true }),
    status: text("status", { enum: ["active", "completed", "archived"] })
      .notNull()
      .default("active"),
    // Requirement 24 — the domain function sets this explicitly per insert
    // (e.g. "ready" immediately when there's no description to generate
    // from); the column default is only a fallback, never relied upon.
    taskGenerationStatus: text("task_generation_status", {
      enum: ["pending", "generating", "ready", "failed"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("projects_project_id_idx").on(table.projectId)],
);

/**
 * Insert-only. `projectId` is a plain indexed uuid, not a foreign key: fold
 * keys are shared across every revision of an entity, so they're never
 * unique and can't be an FK target (the same reason `events.eventId` below
 * has an index, not a constraint). Referential integrity across entities is
 * enforced in packages/domain, not in the schema.
 */
export const tasks = pgTable(
  "tasks",
  {
    rowId: uuid("row_id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    projectId: uuid("project_id"),
    title: text("title").notNull(),
    description: text("description"),
    estimatedMinutes: integer("estimated_minutes"),
    // Backend-resolved from a date expression, like events.startsAt.
    deadline: timestamp("deadline", { withTimezone: true }),
    status: text("status", { enum: ["open", "completed", "cancelled"] })
      .notNull()
      .default("open"),
    // Requirement 24's discard reporting needs to distinguish a
    // user-authored task from a generated one.
    source: text("source", { enum: ["user", "generated"] })
      .notNull()
      .default("user"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tasks_task_id_idx").on(table.taskId), index("tasks_project_id_idx").on(table.projectId)],
);

/**
 * Insert-only per ARCHITECTURE.md §4's classification — never UPDATE, never
 * DELETE outside retention. `eventId` is the fold key (Requirement 25 of
 * Phase 1); `rowId` is only this row's own identity.
 *
 * Widened in Phase 2 Stage 2 (phase-2-tools.md): `durationMinutes` is now
 * required (Requirement 12 — deletes two workaround rules the prior
 * implementation needed for a durationless event); `status` gained four
 * values; `taskId`/`parentEventId`/`partIndex`/`movedFromEventId`/
 * `actualMinutes` support task linkage, splitting (Requirement 15), and
 * reschedule lineage (Requirement 8). None of these five new columns is a
 * foreign key, for the same reason `taskId` above isn't — they reference
 * fold keys, which are never unique.
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
    // NOT NULL as of Stage 2 (Requirement 12) — DEFAULT_EVENT_MINUTES (30)
    // is applied by the domain layer, never relied upon as a DB default,
    // so the column itself carries none.
    durationMinutes: integer("duration_minutes").notNull(),
    status: text("status", {
      enum: ["proposed", "planned", "completed", "rescheduled", "cancelled"],
    })
      .notNull()
      .default("planned"),
    taskId: uuid("task_id"),
    parentEventId: uuid("parent_event_id"),
    partIndex: integer("part_index"),
    movedFromEventId: uuid("moved_from_event_id"),
    actualMinutes: integer("actual_minutes"),
    sourceMessageId: uuid("source_message_id").references(() => messages.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("events_event_id_idx").on(table.eventId), index("events_task_id_idx").on(table.taskId)],
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
 * Ordinary mutable (ARCHITECTURE.md §4) — operational state, not domain
 * history, so this table is a real UPDATE target (unlike projects/tasks/
 * events). `subjectId` is a projectId (project_task_breakdown) or a
 * generation_runs.id (schedule_generation) — a plain uuid, not an FK, for
 * the same fold-key reason events.taskId isn't one.
 */
export const batchJobs = pgTable("batch_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind", { enum: ["project_task_breakdown", "schedule_generation"] }).notNull(),
  subjectId: uuid("subject_id").notNull(),
  providerBatchId: text("provider_batch_id").notNull(),
  status: text("status", {
    enum: ["submitted", "polling", "ended", "applied", "failed"],
  })
    .notNull()
    .default("submitted"),
  attempts: integer("attempts").notNull().default(0),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costMicros: integer("cost_micros"),
  // Category only, per the spec's Security section — never the raw
  // provider error (see AnthropicBatchProvider's error mapping).
  failureCategory: text("failure_category"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});

/**
 * Ordinary mutable. Requirement 14's overflow report needs to survive past
 * the message that announces it ("what didn't fit?" answerable later
 * without regenerating) — this is where it's persisted. `overflow` is a
 * JSON array of `{ taskId, reason }`, not a normalized table: it's written
 * once per run and never queried by its own fields, only read back whole.
 */
export const generationRuns = pgTable("generation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  horizonStart: timestamp("horizon_start", { withTimezone: true }).notNull(),
  horizonEnd: timestamp("horizon_end", { withTimezone: true }).notNull(),
  batchJobId: uuid("batch_job_id").references(() => batchJobs.id),
  placedCount: integer("placed_count").notNull().default(0),
  overflow: text("overflow").notNull().default("[]"),
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

/** The fold: latest row per project_id. Same tie-break rule as events_current. */
export const projectsCurrent = pgView("projects_current").as((qb) =>
  qb
    .selectDistinctOn([projects.projectId])
    .from(projects)
    .orderBy(projects.projectId, desc(projects.createdAt), desc(projects.rowId)),
);

/** The fold: latest row per task_id. Same tie-break rule as events_current. */
export const tasksCurrent = pgView("tasks_current").as((qb) =>
  qb
    .selectDistinctOn([tasks.taskId])
    .from(tasks)
    .orderBy(tasks.taskId, desc(tasks.createdAt), desc(tasks.rowId)),
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  events: many(events),
  projects: many(projects),
  tasks: many(tasks),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  messages: many(messages),
  turnUsage: many(turnUsage),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, { fields: [messages.sessionId], references: [sessions.id] }),
}));
