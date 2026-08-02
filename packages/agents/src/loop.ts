import type { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import type { LLMMessage, LLMProvider, LLMToolDefinition, LLMUsage } from "@assistant/providers";

const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_TIME_BUDGET_MS = 60_000;

export type AgentOutcome = "text" | "tool_success" | "tool_exhausted" | "budget_exceeded";

export interface AgentResult {
  outcome: AgentOutcome;
  /** The model's own text — only populated for outcome "text". */
  text: string;
  toolName?: string;
  /** The tool's structuredContent — only populated for outcome "tool_success". */
  toolResult?: unknown;
  /** Summed across every provider call this turn made — a retry is a real, billed call. */
  usage: LLMUsage;
  model: string;
  /** How many provider calls this turn made — the "exactly one on success" acceptance criterion. */
  providerCallCount: number;
  /** How many tool invocations were attempted, success or failure. */
  toolCallCount: number;
}

interface McpToolContentBlock {
  type: string;
  text?: string;
}

interface McpToolResult {
  content?: McpToolContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
}

function extractResultText(toolResult: McpToolResult): string {
  const blocks = toolResult.content ?? [];
  const text = blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join(" ");
  return text.length > 0 ? text : "Tool call failed.";
}

function addUsage(total: LLMUsage, next: LLMUsage): LLMUsage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    cacheReadTokens: total.cacheReadTokens + next.cacheReadTokens,
  };
}

export interface RunAgentTurnParams {
  provider: LLMProvider;
  systemPrompt: string;
  messages: LLMMessage[];
  mcpClient: McpClient;
  tools: LLMToolDefinition[];
  maxIterations?: number;
  timeBudgetMs?: number;
}

/**
 * The bounded tool loop (Requirement 11): each iteration is one provider
 * call. A response with no tool call ends the loop immediately — the
 * conversational path, identical to Stage 4. A successful tool call ends
 * the loop immediately too (Requirement 14: no narration round-trip). Only
 * a FAILED tool call continues the loop: the error is fed back as a proper
 * tool_use/tool_result exchange so the model can retry within budget
 * (Requirement 21) — Anthropic's API requires every tool_use block to be
 * followed by a matching tool_result in the very next message, so this
 * can't be done as a plain-text retry.
 */
export async function runAgentTurn(params: RunAgentTurnParams): Promise<AgentResult> {
  const startedAtMs = performance.now();
  const maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const timeBudgetMs = params.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;

  let conversationMessages = params.messages;
  let usage: LLMUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  let model = params.provider.model;
  let providerCallCount = 0;
  let toolCallCount = 0;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (performance.now() - startedAtMs > timeBudgetMs) {
      return { outcome: "budget_exceeded", text: "", usage, model, providerCallCount, toolCallCount };
    }

    const result = await params.provider.complete({
      systemPrompt: params.systemPrompt,
      messages: conversationMessages,
      tools: params.tools,
    });
    providerCallCount += 1;
    usage = addUsage(usage, result.usage);
    model = result.model;

    if (!result.toolCall) {
      return { outcome: "text", text: result.text, usage, model, providerCallCount, toolCallCount };
    }

    toolCallCount += 1;
    const toolResult = (await params.mcpClient.callTool({
      name: result.toolCall.name,
      arguments: result.toolCall.input,
    })) as McpToolResult;

    if (!toolResult.isError) {
      return {
        outcome: "tool_success",
        text: "",
        toolName: result.toolCall.name,
        toolResult: toolResult.structuredContent,
        usage,
        model,
        providerCallCount,
        toolCallCount,
      };
    }

    const errorText = extractResultText(toolResult);
    conversationMessages = [
      ...conversationMessages,
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: result.toolCall.id,
            name: result.toolCall.name,
            input: result.toolCall.input,
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", toolUseId: result.toolCall.id, content: errorText, isError: true }],
      },
    ];
  }

  return { outcome: "tool_exhausted", text: "", usage, model, providerCallCount, toolCallCount };
}
