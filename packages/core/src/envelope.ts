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
