import type { DayShape } from "./dayShape.js";

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
  /**
   * Stage 4 addition, optional: only `updateEvent`'s `split` action reads
   * this, to place a split's remainder (Requirement 15). Omitted in tests
   * that deliberately exercise the no-placement-available fallback; always
   * present in production (apps/server loads it once at boot, per
   * Requirement 18/decision 13 — a config file, never read here directly).
   */
  dayShape?: DayShape;
}
