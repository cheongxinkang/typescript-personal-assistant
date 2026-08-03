import type { ChannelAdapter } from "@assistant/core";
import { insertAssistantMessage, listEndedBatchJobs, type Database } from "@assistant/db";
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
 *
 * That message is also persisted via `insertAssistantMessage` — found
 * missing during Stage 7's real end-to-end pass: without it, the message
 * genuinely reached Discord but a later conversational turn's history load
 * never saw it, so the model had no way to know generation had finished
 * and answered a follow-up question from a stale, hallucinated guess
 * instead. Every other assistant reply goes through `runTurn`, which
 * already does this; this is the one path that doesn't run through
 * `runTurn` at all, so it has to do it explicitly.
 */
export async function applyEndedBatchJobsOnce(
  database: Database,
  batchProvider: BatchProvider,
  adapter: ChannelAdapter,
  context: { ownerUserId: string; ownerTimezone: string; dayShape: DayShape; sessionId: string },
  logger: PollLogger,
): Promise<void> {
  const jobs = await listEndedBatchJobs(database);

  async function sendAndRecord(text: string): Promise<void> {
    await adapter.sendToConfiguredChannel(text);
    await insertAssistantMessage(database, { sessionId: context.sessionId, content: text });
  }

  for (const job of jobs) {
    try {
      if (job.kind === "project_task_breakdown") {
        const result = await applyProjectBreakdown(database, batchProvider, job, {
          ownerUserId: context.ownerUserId,
        });
        await sendAndRecord(renderProjectBreakdownApplied(result));
        logger.info({ batchJobId: job.id }, "Project task breakdown applied");
      } else {
        const result = await applyScheduleGeneration(database, batchProvider, job, {
          ownerUserId: context.ownerUserId,
          ownerTimezone: context.ownerTimezone,
          dayShape: context.dayShape,
        });
        await sendAndRecord(renderScheduleGenerationApplied(result));
        logger.info({ batchJobId: job.id }, "Schedule generation applied");
      }
    } catch (error) {
      if (error instanceof BatchApplyFailure) {
        const text =
          job.kind === "project_task_breakdown"
            ? renderProjectBreakdownFailed({ category: error.category })
            : renderScheduleGenerationFailed({ category: error.category });
        await sendAndRecord(text);
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
