import { BATCH_MAX_AGE_HOURS } from "@assistant/domain";
import { listNonTerminalBatchJobs, updateBatchJob, type Database } from "@assistant/db";
import type { BatchProvider } from "@assistant/providers";

/**
 * Arbitrary but fixed — must be stable across every pod so two pods
 * (a rolling update's brief overlap) contend for the *same* lock rather
 * than each acquiring their own. Distinct from any future scheduler
 * concern's own key (ARCHITECTURE.md §3.2: "one tick loop, several
 * concerns" — ADVISORY_LOCK_KEY is this concern's own, not shared).
 */
const ADVISORY_LOCK_KEY = 918_273_645;

export interface PollLogger {
  info: (fields: Record<string, unknown>, message: string) => void;
  error: (fields: Record<string, unknown>, message: string) => void;
}

const NOOP_LOGGER: PollLogger = { info: () => undefined, error: () => undefined };

/**
 * Stage 5's poller only tracks *whether* a batch has finished processing —
 * validating and applying its results (Requirement 23/26) is kind-specific
 * and belongs to Stage 6's two workflows, which call `fetchResults`
 * themselves and make the final "applied"/"failed" transition. This keeps
 * the poller agnostic of what a batch's results even mean.
 *
 * Wrapped in a Postgres advisory lock (ARCHITECTURE.md §6): a rolling
 * update briefly runs two pods, and without this both would poll and
 * double-count `attempts`. `pg_try_advisory_lock`/`pg_advisory_unlock` are
 * **session-scoped** — they only guard against a second caller if the lock
 * and the unlock run on the *same physical connection*. `database.client`
 * is a pool, so two ordinary tagged-template queries can silently land on
 * different connections; the naive version of this function (lock via one
 * pooled query, unlock via another) let two concurrent ticks both acquire
 * "the lock" and both proceed — caught by the concurrent-ticks test below,
 * not assumed. Fixed by reserving one dedicated connection (`.reserve()`)
 * for the lock and unlock specifically; the actual per-job queries still
 * use the ordinary pool, since only the lock itself needs connection
 * affinity. Confirmed separately (Stage 0's spike) that a closed connection
 * releases its advisory locks automatically, so a crash mid-tick can't
 * leave the lock held forever.
 *
 * Safe to run twice (ARCHITECTURE.md §3.2): re-checking an already-"ended"
 * or "failed" job is a no-op, since `listNonTerminalBatchJobs` only returns
 * `submitted`/`polling` rows.
 */
export async function pollBatchJobsOnce(
  database: Database,
  batchProvider: BatchProvider,
  now: Date,
  logger: PollLogger = NOOP_LOGGER,
): Promise<void> {
  const reserved = await database.client.reserve();
  try {
    const lockRows = await reserved<{ locked: boolean }[]>`
      select pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as locked
    `;
    const acquired = lockRows[0]?.locked === true;
    if (!acquired) {
      logger.info({}, "Batch poller: another instance holds the lock, skipping this tick");
      return;
    }

    try {
      const jobs = await listNonTerminalBatchJobs(database);
      for (const job of jobs) {
        const ageHours = (now.getTime() - job.submittedAt.getTime()) / (1000 * 60 * 60);
        if (ageHours > BATCH_MAX_AGE_HOURS) {
          await updateBatchJob(database, job.id, {
            status: "failed",
            failureCategory: "expired",
            attempts: job.attempts + 1,
          });
          logger.info({ batchJobId: job.id }, "Batch job expired, marked failed");
          continue;
        }

        try {
          const status = await batchProvider.checkStatus(job.providerBatchId);
          if (status.status !== "ended") {
            await updateBatchJob(database, job.id, { status: "polling", attempts: job.attempts + 1 });
            continue;
          }
          await updateBatchJob(database, job.id, {
            status: "ended",
            endedAt: status.endedAt ?? now,
            attempts: job.attempts + 1,
          });
          logger.info({ batchJobId: job.id }, "Batch job ended, ready to apply");
        } catch (error) {
          await updateBatchJob(database, job.id, {
            status: "failed",
            failureCategory: "poll_error",
            attempts: job.attempts + 1,
          });
          logger.error(
            { batchJobId: job.id, err: error instanceof Error ? error.message : String(error) },
            "Batch poll failed",
          );
        }
      }
    } finally {
      await reserved`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    }
  } finally {
    reserved.release();
  }
}
