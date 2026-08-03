import type { LLMMessage, LLMUsage } from "./provider.js";

/** One request within a batch — the batch-API analogue of LLMCompleteParams. */
export interface BatchRequestItem {
  /** Must be unique within the batch (Anthropic's own requirement) — see Stage 0's spike. */
  customId: string;
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens?: number;
}

export interface BatchSubmission {
  providerBatchId: string;
}

export type BatchProcessingStatus = "in_progress" | "ended";

export interface BatchStatusResult {
  status: BatchProcessingStatus;
  requestCounts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  endedAt: Date | null;
}

/**
 * Requirement 27: usage is present on `succeeded` (confirmed available at
 * `result.message.usage` in Stage 0's real spike — no fallback needed).
 * `errored`'s `category` is the mapped category, never the raw provider
 * error (per the spec's Security section, carried over from Phase 1) —
 * see AnthropicBatchProvider's mapping of the double-nested error shape
 * Stage 0's spike also found.
 */
export type BatchResultOutcome =
  | { type: "succeeded"; text: string; model: string; usage: LLMUsage }
  | { type: "errored"; category: string }
  | { type: "canceled" }
  | { type: "expired" };

export interface BatchResultItem {
  customId: string;
  outcome: BatchResultOutcome;
}

/**
 * One call shape for both real batch workflows (Stage 6). Mirrors
 * `LLMProvider`'s split of concerns but across the batch API's three-step
 * lifecycle (submit, poll, fetch) rather than one round trip.
 */
export interface BatchProvider {
  readonly name: string;
  submit(items: readonly BatchRequestItem[]): Promise<BatchSubmission>;
  checkStatus(providerBatchId: string): Promise<BatchStatusResult>;
  fetchResults(providerBatchId: string): Promise<BatchResultItem[]>;
}
