/**
 * Requirement 1: domain functions take (dependencies, validatedInput,
 * context) and return typed JSON. `context` carries only values — never a
 * Clock, never a way to reach configuration or the environment — so a
 * domain function's output is fully determined by its arguments. `now` is
 * the same already-read instant the turn started with (see
 * packages/core's Clock doc); nothing here re-reads it.
 */
export interface DomainContext {
  now: Date;
  ownerTimezone: string;
  ownerUserId: string;
}
