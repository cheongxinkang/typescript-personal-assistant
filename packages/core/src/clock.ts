/**
 * The only sanctioned source of "now" in the system. Read exactly once per
 * turn and threaded as a value — see docs/ARCHITECTURE.md §2 ("Time") and
 * phase-1-vertical-slice.md Requirement 9. Nothing in packages/chat-loop,
 * packages/tools, or packages/agents should call `new Date()` directly
 * (enforced by eslint.config.js's no-restricted-syntax rule); everything
 * downstream takes a Date it was handed.
 */
export interface Clock {
  now(): Date;
}

/** The only place `new Date()` is allowed to originate a turn's instant. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** A deterministic clock for tests — see phase-1-vertical-slice.md's Test plan. */
export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return this.instant;
  }
}
