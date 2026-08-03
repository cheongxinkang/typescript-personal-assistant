import type { BatchResultItem } from "@assistant/providers";

/**
 * Shared by both apply functions — a non-"succeeded" outcome's category:
 * "errored" carries its own mapped category (Stage 0's spike found the real
 * double-nested provider error shape, never surfaced raw here per the
 * spec's Security section); "canceled"/"expired" have no finer detail, so
 * the outcome's own type is the category; a missing result entirely is
 * "missing_result".
 */
export function categorizeBatchOutcome(result: BatchResultItem | undefined): string {
  if (!result) {
    return "missing_result";
  }
  if (result.outcome.type === "errored") {
    return result.outcome.category;
  }
  return result.outcome.type;
}
