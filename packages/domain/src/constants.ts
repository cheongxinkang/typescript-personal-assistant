/**
 * Domain-wide policy constants, per phase-2-tools.md's Configuration
 * section. Passed into functions as literals in tests — never read from the
 * environment here — so every rule stays testable without booting config.
 */
export const DEFAULT_EVENT_MINUTES = 30;
export const MAX_EVENT_MINUTES = 1440;
export const MAX_TASK_MINUTES = 480;
export const MAX_SCHEDULE_DAYS = 31;
export const GENERATION_HORIZON_DAYS = 7;
export const BATCH_MAX_AGE_HOURS = 26;
