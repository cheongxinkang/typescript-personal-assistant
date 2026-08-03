import type { ChannelAdapter } from "@assistant/core";
import { listEndedBatchJobs, type Database } from "@assistant/db";
import {
  applyProjectBreakdown,
  applyScheduleGeneration,
  BatchApplyFailure,
  type DayShape,
} from "@assistant/domain";
import type { BatchProvider } from "@assistant/providers";
import {
  renderProjectBreakdownApplied,
  renderProjectBreakdownFailed,
  renderScheduleGenerationApplied,
  renderScheduleGenerationFailed,
} from "@assistant/rendering";
import type { PollLogger } from "./poller.js";

/**
 * Runs right after the poll tick (Requirement 26): every job the poller
 * marked "ended" gets its kind-specific apply step. A failure from either
 * apply function (`BatchApplyFailure`) is exactly the propagation
 * Requirement 26 asks for — caught **here**, not swallowed inside the
 * domain function, and turned into the one place this whole workflow
 * departs from `runTurn`'s pattern: there is no inbound message to reply
 * to, so the result — success or failure — is sent as a new, unprompted
 * message via `ChannelAdapter.sendToConfiguredChannel`.
 */
export async function applyEndedBatchJobsOnce(
  database: Database,
  batchProvider: BatchProvider,
  adapter: ChannelAdapter,
  context: { ownerUserId: string; ownerTimezone: string; dayShape: DayShape },
  logger: PollLogger,
): Promise<void> {
  const jobs = await listEndedBatchJobs(database);

  for (const job of jobs) {
    try {
      if (job.kind === "project_task_breakdown") {
        const result = await applyProjectBreakdown(database, batchProvider, job, {
          ownerUserId: context.ownerUserId,
        });
        await adapter.sendToConfiguredChannel(renderProjectBreakdownApplied(result));
        logger.info({ batchJobId: job.id }, "Project task breakdown applied");
      } else {
        const result = await applyScheduleGeneration(database, batchProvider, job, {
          ownerUserId: context.ownerUserId,
          ownerTimezone: context.ownerTimezone,
          dayShape: context.dayShape,
        });
        await adapter.sendToConfiguredChannel(renderScheduleGenerationApplied(result));
        logger.info({ batchJobId: job.id }, "Schedule generation applied");
      }
    } catch (error) {
      if (error instanceof BatchApplyFailure) {
        const text =
          job.kind === "project_task_breakdown"
            ? renderProjectBreakdownFailed({ category: error.category })
            : renderScheduleGenerationFailed({ category: error.category });
        await adapter.sendToConfiguredChannel(text);
        logger.error({ batchJobId: job.id, category: error.category }, "Batch apply failed");
        continue;
      }
      // An unexpected error (e.g. Discord send itself failed) — never
      // silently consumed; logged, and the job stays "ended" so the next
      // tick retries applying it rather than leaving it stuck unnoticed.
      logger.error(
        { batchJobId: job.id, err: error instanceof Error ? error.message : String(error) },
        "Unexpected error applying batch job",
      );
    }
  }
}
