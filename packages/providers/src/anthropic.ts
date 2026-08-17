import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMCompleteParams,
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
  LLMResult,
} from "./provider.js";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;

type AnthropicMessageContentBlock =
  | Anthropic.TextBlockParam
  | Anthropic.ToolUseBlockParam
  | Anthropic.ToolResultBlockParam;

function toAnthropicContent(content: string | LLMContentBlock[]): Anthropic.MessageParam["content"] {
  if (typeof content === "string") {
    return content;
  }
  return content.map((block): AnthropicMessageContentBlock => {
    if (block.type === "text") {
      return { type: "text", text: block.text };
    }
    if (block.type === "tool_use") {
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    }
    return {
      type: "tool_result",
      tool_use_id: block.toolUseId,
      content: block.content,
      ...(block.isError !== undefined ? { is_error: block.isError } : {}),
    };
  });
}

function toAnthropicMessage(message: LLMMessage): Anthropic.MessageParam {
  return { role: message.role, content: toAnthropicContent(message.content) };
}

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
      messages: params.messages.map(toAnthropicMessage),
      ...(params.tools
        ? {
            tools: params.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              // The MCP client's listTools() JSON Schema is a superset of
              // what Anthropic's API needs; extra keys are ignored, not rejected.
              input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
            })),
          }
        : {}),
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    const toolCall = toolUseBlock
      ? {
          id: toolUseBlock.id,
          name: toolUseBlock.name,
          input: toolUseBlock.input as Record<string, unknown>,
        }
      : undefined;

    return {
      text,
      toolCall,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens,
        // SDK bumped 0.32.1 -> 0.115.0 in Phase 2 Stage 0, specifically to
        // get the stable (non-beta) Batch API. cache_read_input_tokens is
        // in the stable Usage type at this version (it was beta-only
        // before), so the previously-hardcoded 0 is now the real figure.
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
