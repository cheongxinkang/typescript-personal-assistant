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
}

export const EVENT_CREATED_KIND = "event_created" as const;

export type EventCreatedEnvelope = ResponseEnvelope<typeof EVENT_CREATED_KIND, EventCreatedData>;
