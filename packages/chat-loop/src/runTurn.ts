import {
  CONVERSATIONAL_KIND,
  EVENT_CREATED_KIND,
  FAILURE_KIND,
  type EventCreatedData,
  type ResponseEnvelope,
} from "@assistant/core";
import type { LLMProvider, LLMToolDefinition } from "@assistant/providers";
import type { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { runAgentTurn } from "@assistant/agents";
import {
  insertAssistantMessage,
  insertTurnUsage,
  loadRecentHistory,
  type Database,
} from "@assistant/db";
import type { RenderRegistry } from "@assistant/rendering";
import { buildUserMessageEnvelope } from "./contextEnvelope.js";

const DEFAULT_HISTORY_LIMIT = 20;
const GENERIC_FAILURE_MESSAGE =
  "Sorry, something went wrong talking to the model. Please try again.";
const BUDGET_EXCEEDED_MESSAGE =
  "That's taking too long to work through. Please try again or rephrase your request.";

/**
 * A caller-contract violation (the caller must persist the user's message
 * before calling runTurn), not an external failure — this must always
 * propagate as a thrown error, never be converted into a generic
 * user-facing envelope the way a genuine DB/provider failure is. Kept
 * distinct from a plain Error precisely so the catch block below can tell
 * the two apart and re-throw this one.
 */
class EmptyHistoryError extends Error {
  constructor() {
    super(
      "runTurn called with empty history — the caller must persist the user's message before calling runTurn.",
    );
    this.name = "EmptyHistoryError";
  }
}

export interface RunTurnParams {
  database: Database;
  provider: LLMProvider;
  systemPrompt: string;
  sessionId: string;
  /**
   * The turn's already-read Clock instant — read once by the caller
   * (apps/server), not here. Both this turn's message envelope and the
   * per-turn ToolContext the caller builds for the MCP server need the
   * SAME instant; reading it here as well as there would risk skew
   * between context assembly and any date resolution a tool performs.
   */
  now: Date;
  ownerTimezone: string;
  /** Composed by the caller (apps/server); runTurn calls it, per ARCHITECTURE.md §2's "chat loop renders". */
  registry: RenderRegistry;
  mcpClient: McpClient;
  tools: LLMToolDefinition[];
  historyLimit?: number;
  onError?: (error: unknown) => void;
}

export interface RunTurnResult {
  envelope: ResponseEnvelope;
  text: string;
}

/**
 * Maps a successful tool's structuredContent to its envelope kind. Stage 5
 * has exactly one tool, so this is a plain switch — generalize (e.g. each
 * ToolDefinition declaring its own envelope kind) only once a second tool
 * actually needs it.
 */
function envelopeForToolResult(toolName: string, toolResult: unknown): ResponseEnvelope {
  if (toolName === "add_event") {
    return { status: "success", kind: EVENT_CREATED_KIND, data: toolResult as EventCreatedData };
  }
  return { status: "error", kind: FAILURE_KIND, data: { message: GENERIC_FAILURE_MESSAGE } };
}

/**
 * The conversational call path (Requirement 8): appends to history, and
 * converts any failure into a user-visible envelope rather than throwing —
 * the inverse of workflowCompletion.ts. Delegates the actual model/tool
 * round trip to packages/agents' bounded loop; owns history load,
 * persistence, turn_usage recording, and rendering (ARCHITECTURE.md §2)
 * itself, since it already depends on packages/db and packages/rendering.
 */
export async function runTurn(params: RunTurnParams): Promise<RunTurnResult> {
  const startedAtMs = performance.now();
  try {
    // Inside the try: a DB failure loading history (Failure/edge case
    // "Database unavailable mid-turn") gets the same graceful envelope
    // treatment as a provider failure below, rather than propagating as an
    // unhandled rejection past runTurn entirely.
    const history = await loadRecentHistory(
      params.database,
      params.sessionId,
      params.historyLimit ?? DEFAULT_HISTORY_LIMIT,
    );

    if (history.length === 0) {
      throw new EmptyHistoryError();
    }

    const lastIndex = history.length - 1;
    const providerMessages = history.map((row, index) => ({
      role: row.role,
      content:
        index === lastIndex && row.role === "user"
          ? buildUserMessageEnvelope(params.now, params.ownerTimezone, row.content)
          : row.content,
    }));

    const agentResult = await runAgentTurn({
      provider: params.provider,
      systemPrompt: params.systemPrompt,
      messages: providerMessages,
      mcpClient: params.mcpClient,
      tools: params.tools,
    });
    const latencyMs = Math.round(performance.now() - startedAtMs);

    let envelope: ResponseEnvelope;
    if (agentResult.outcome === "text") {
      envelope = { status: "success", kind: CONVERSATIONAL_KIND, data: { text: agentResult.text } };
    } else if (agentResult.outcome === "tool_success") {
      envelope = envelopeForToolResult(agentResult.toolName ?? "", agentResult.toolResult);
    } else {
      // "tool_exhausted" (retries used up without success) or
      // "budget_exceeded" (Requirement 11) — both a distinct, user-visible
      // outcome, never a silent truncation.
      envelope = { status: "error", kind: FAILURE_KIND, data: { message: BUDGET_EXCEEDED_MESSAGE } };
    }

    const text = params.registry.render(envelope, { timezone: params.ownerTimezone });
    const outcome = envelope.status === "success" ? "success" : "failure";

    if (outcome === "success") {
      await insertAssistantMessage(params.database, { sessionId: params.sessionId, content: text });
    }
    await insertTurnUsage(params.database, {
      sessionId: params.sessionId,
      provider: params.provider.name,
      model: agentResult.model,
      inputTokens: agentResult.usage.inputTokens,
      outputTokens: agentResult.usage.outputTokens,
      cacheReadTokens: agentResult.usage.cacheReadTokens,
      latencyMs,
      outcome,
      toolCalls: agentResult.toolCallCount,
    });

    return { envelope, text };
  } catch (error) {
    if (error instanceof EmptyHistoryError) {
      throw error; // a caller-contract violation, not an external failure
    }

    params.onError?.(error);
    const latencyMs = Math.round(performance.now() - startedAtMs);

    try {
      await insertTurnUsage(params.database, {
        sessionId: params.sessionId,
        provider: params.provider.name,
        model: params.provider.model,
        inputTokens: null,
        outputTokens: null,
        latencyMs,
        outcome: "failure",
      });
    } catch (usageWriteError) {
      // The database write itself failed too — e.g. it's genuinely
      // unreachable, the same condition that likely caused the outer
      // failure. Nothing more can be recorded, but the user still gets a
      // failure reply rather than an unhandled rejection.
      params.onError?.(usageWriteError);
    }

    // Never the raw error text — see the spec's Security section.
    const envelope: ResponseEnvelope = {
      status: "error",
      kind: FAILURE_KIND,
      data: { message: GENERIC_FAILURE_MESSAGE },
    };
    const text = params.registry.render(envelope, { timezone: params.ownerTimezone });
    return { envelope, text };
  }
}
