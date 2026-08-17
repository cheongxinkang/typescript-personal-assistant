import Anthropic from "@anthropic-ai/sdk";
import { toAnthropicMessage } from "./anthropic.js";
import type {
  BatchProvider,
  BatchRequestItem,
  BatchResultItem,
  BatchStatusResult,
  BatchSubmission,
} from "./batchProvider.js";

const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Real Batch API client, per Stage 0's spike findings against
 * `@anthropic-ai/sdk@0.115.0`: `client.messages.batches.{create,retrieve,
 * results}` (stable, not beta, at this SDK version). Per-request usage is
 * directly available on a `succeeded` result's `message.usage` — no
 * fallback accounting needed (Requirement 27).
 */
export class AnthropicBatchProvider implements BatchProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async submit(items: readonly BatchRequestItem[]): Promise<BatchSubmission> {
    const batch = await this.client.messages.batches.create({
      requests: items.map((item) => ({
        custom_id: item.customId,
        params: {
          model: this.model,
          max_tokens: item.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: item.systemPrompt,
          messages: item.messages.map(toAnthropicMessage),
        },
      })),
    });
    return { providerBatchId: batch.id };
  }

  async checkStatus(providerBatchId: string): Promise<BatchStatusResult> {
    const batch = await this.client.messages.batches.retrieve(providerBatchId);
    return {
      status: batch.processing_status === "ended" ? "ended" : "in_progress",
      requestCounts: {
        processing: batch.request_counts.processing,
        succeeded: batch.request_counts.succeeded,
        errored: batch.request_counts.errored,
        canceled: batch.request_counts.canceled,
        expired: batch.request_counts.expired,
      },
      endedAt: batch.ended_at ? new Date(batch.ended_at) : null,
    };
  }

  async fetchResults(providerBatchId: string): Promise<BatchResultItem[]> {
    const stream = await this.client.messages.batches.results(providerBatchId);
    const items: BatchResultItem[] = [];

    for await (const line of stream) {
      if (line.result.type === "succeeded") {
        const message = line.result.message;
        const text = message.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");
        items.push({
          customId: line.custom_id,
          outcome: {
            type: "succeeded",
            text,
            model: message.model,
            usage: {
              inputTokens: message.usage.input_tokens ?? 0,
              outputTokens: message.usage.output_tokens,
              cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
            },
          },
        });
      } else if (line.result.type === "errored") {
        // Never the raw provider error (spec's Security section) — only
        // the inner error's `type`, e.g. "not_found_error", per Stage 0's
        // spike of the real double-nested error shape.
        items.push({
          customId: line.custom_id,
          outcome: { type: "errored", category: line.result.error.error.type },
        });
      } else {
        items.push({ customId: line.custom_id, outcome: { type: line.result.type } });
      }
    }

    return items;
  }
}
