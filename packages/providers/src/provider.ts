/**
 * A message's content is a plain string for ordinary conversational turns.
 * The array form is used only for the one shape Stage 5 needs: an
 * assistant turn that made a tool call, and the user-role tool_result
 * turn that must immediately follow it — Anthropic's API rejects a
 * tool_use block with no corresponding tool_result in the very next
 * message. Nothing else in this phase needs richer content, so nothing
 * else is modelled.
 */
export type LLMContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | LLMContentBlock[];
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

/** JSON Schema, matching what an MCP client's listTools() already returns verbatim. */
export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMCompleteParams {
  systemPrompt: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
}

export interface LLMResult {
  /** Empty string when the model made a tool call and produced no text alongside it. */
  text: string;
  toolCall?: LLMToolCall;
  model: string;
  usage: LLMUsage;
}

/**
 * One call shape for both of chat-loop's paths (runTurn and
 * workflowCompletion) — the distinction between them is about what the
 * caller does with history and failure, not about what the provider does.
 */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(params: LLMCompleteParams): Promise<LLMResult>;
}
