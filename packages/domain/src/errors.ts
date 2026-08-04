/**
 * Requirement 17: an inverted or over-long range is a validation error, not
 * a query that silently returns nothing or thousands of rows. Distinct from
 * DateExpressionError (an unparseable expression) — this is a valid pair of
 * expressions that resolve to an invalid range.
 */
export class ScheduleRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleRangeError";
  }
}

/** Thrown when an operation names a fold key (taskId/eventId/projectId) that doesn't exist. */
export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`No ${entity} found with id "${id}"`);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when a title-based reference (update_event/update_task, given a
 * `title` instead of an id) matches more than one candidate. The message is
 * plain text fed back to the model as a tool_result, the same established
 * pattern DateExpressionError/NotFoundError already use (ARCHITECTURE.md
 * §2's "no prose from a tool" rule governs a *successful* result's shape,
 * not an error message meant to prompt a retry) — the model is expected to
 * ask the owner to disambiguate, in its own words, rather than guess.
 */
export class AmbiguousReferenceError extends Error {
  constructor(
    entity: string,
    searchTerm: string,
    public readonly candidates: readonly string[],
  ) {
    super(
      `Multiple ${entity}s match "${searchTerm}": ${candidates.join("; ")}. ` +
        "Ask which one is meant, or narrow the search (e.g. with a date).",
    );
    this.name = "AmbiguousReferenceError";
  }
}
