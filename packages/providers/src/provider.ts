export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface LLMCompleteParams {
  systemPrompt: string;
  messages: LLMMessage[];
}

export interface LLMResult {
  text: string;
  model: string;
  usage: LLMUsage;
}

/**
 * One call shape for both of chat-loop's paths (runTurn and
 * workflowCompletion) — the distinction between them is about what the
 * caller does with history and failure, not about what the provider does.
 * Tool support is added when Stage 5 needs it, additively.
 */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(params: LLMCompleteParams): Promise<LLMResult>;
}
