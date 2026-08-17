/**
 * Every turn resolves to exactly one of these. packages/rendering consumes
 * this type and nothing else — see docs/ARCHITECTURE.md §2 ("JSON in, JSON
 * out, rendered once") and phase-1-vertical-slice.md Requirement 13.
 *
 * `kind` is the dispatch key the rendering registry is built from
 * (Requirement 16); adding a new kind without a registered renderer is a
 * startup failure, never a runtime one.
 */
export type ResponseEnvelope<TKind extends string = string, TData = unknown> =
  | { status: "success"; kind: TKind; data: TData }
  | { status: "error"; kind: TKind; data: TData };

/** The one path where the model's own text passes through unchanged. */
export interface ConversationalData {
  text: string;
}

export const CONVERSATIONAL_KIND = "conversational" as const;

export type ConversationalEnvelope = ResponseEnvelope<
  typeof CONVERSATIONAL_KIND,
  ConversationalData
>;

/**
 * runTurn's failure path (Requirement 8: a turn-path failure becomes a
 * user-visible message, never a thrown error). The message is always a
 * fixed, generic string — never a raw provider error, per the spec's
 * Security section.
 */
export interface FailureData {
  message: string;
}

export const FAILURE_KIND = "failure" as const;

export type FailureEnvelope = ResponseEnvelope<typeof FAILURE_KIND, FailureData>;

/**
 * A successful add_event call. Built from the row read back after insert
 * (Requirement 23) — `title`/`startsAt` here are the stored values, never
 * the model's own restated ones, which is what makes the "stored title
 * wins" acceptance criterion checkable at all.
 */
export interface EventCreatedData {
  eventId: string;
  title: string;
  /** ISO-8601 instant, UTC. */
  startsAt: string;
  // NOT NULL as of Phase 2 Stage 2 (phase-2-tools.md Requirement 12) — a
  // durationless event no longer exists; a missing model-supplied value is
  // defaulted by the domain layer before this is ever built.
  durationMinutes: number;
  /** True when the model omitted a duration and DEFAULT_EVENT_MINUTES was applied. */
  durationWasDefaulted: boolean;
  /**
   * Requirement 14: creating an event succeeds even when it overlaps an
   * existing planned/completed event — this names what it overlaps rather
   * than refusing. Empty when there's no clash.
   */
  clashesWith: string[];
}

export const EVENT_CREATED_KIND = "event_created" as const;

export type EventCreatedEnvelope = ResponseEnvelope<typeof EVENT_CREATED_KIND, EventCreatedData>;

/** One event as it appears in a schedule read (Requirement 17). */
export interface ScheduleEventEntry {
  eventId: string;
  title: string;
  /** ISO-8601 instant, UTC. */
  startsAt: string;
  durationMinutes: number;
  status: "proposed" | "planned" | "completed" | "rescheduled" | "cancelled";
}

/** One calendar day, in the owner's timezone — present even when `events` is empty. */
export interface ScheduleDayGroup {
  /** YYYY-MM-DD, the owner's local calendar day. */
  date: string;
  events: ScheduleEventEntry[];
}

/** get_schedule's result: folded events, grouped by day, ordered within each day. */
export interface ScheduleData {
  /** ISO-8601 instant, UTC — inclusive range start. */
  start: string;
  /** ISO-8601 instant, UTC — exclusive range end. */
  end: string;
  days: ScheduleDayGroup[];
}

export const SCHEDULE_KIND = "schedule" as const;

export type ScheduleEnvelope = ResponseEnvelope<typeof SCHEDULE_KIND, ScheduleData>;

/** A task as read back after add_task or update_task. */
export interface TaskData {
  taskId: string;
  title: string;
  description: string | null;
  estimatedMinutes: number | null;
  /** ISO-8601 instant, UTC, or null if the task has no deadline. */
  deadline: string | null;
  status: "open" | "completed" | "cancelled";
  projectId: string | null;
  /**
   * Requirement 9's edge case: completing/cancelling a task with events
   * still attached does not touch those events — this names them so the
   * reply can say so, rather than silently leaving them orphaned-looking.
   */
  orphanedEventIds: string[];
}

export const TASK_ADDED_KIND = "task_added" as const;

export type TaskAddedEnvelope = ResponseEnvelope<typeof TASK_ADDED_KIND, TaskData>;

export const TASK_UPDATED_KIND = "task_updated" as const;

export type TaskUpdatedEnvelope = ResponseEnvelope<typeof TASK_UPDATED_KIND, TaskData>;

/**
 * update_event's result across all four actions (Requirement 8, 15, 16).
 * One shape covers all of them rather than one type per action, since the
 * tool itself is one operation with a discriminated `action` field
 * (Requirement 28) — the envelope mirrors that.
 */
export interface EventUpdatedData {
  action: "complete" | "cancel" | "move" | "split";
  eventId: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  status: "proposed" | "planned" | "completed" | "rescheduled" | "cancelled";
  actualMinutes: number | null;
  clashesWith: string[];
  /**
   * Set only by a `split` whose remainder could not be placed — no day
   * shape was supplied, or no free interval exists in the horizon
   * (Requirement 18's placement). When placement succeeds instead,
   * `remainderEventId` is set and this is null — the two are mutually
   * exclusive, never both set.
   */
  remainderMinutes: number | null;
  /** Set only by a `split` whose remainder was placed as a new event. */
  remainderEventId: string | null;
  /** Set only alongside `remainderEventId` — ISO-8601 instant, UTC, of the placed remainder. */
  remainderStartsAt: string | null;
  /** Set only by `move` — the event_id of the row this one supersedes. */
  movedFromEventId: string | null;
}

export const EVENT_UPDATED_KIND = "event_updated" as const;

export type EventUpdatedEnvelope = ResponseEnvelope<typeof EVENT_UPDATED_KIND, EventUpdatedData>;
