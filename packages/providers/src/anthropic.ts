import Anthropic from "@anthropic-ai/sdk";
import type { LLMCompleteParams, LLMProvider, LLMResult } from "./provider.js";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(params: LLMCompleteParams): Promise<LLMResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: params.systemPrompt,
      messages: params.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        // @anthropic-ai/sdk@0.32.1's stable Usage type has no cache-read
        // field yet (it's beta-only, under a different client surface at
        // this SDK version). Always 0 until Stage 6 wires up real prompt
        // caching, at which point this is worth an SDK bump too.
        cacheReadTokens: 0,
      },
    };
  }
}
