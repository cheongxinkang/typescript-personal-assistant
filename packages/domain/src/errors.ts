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
