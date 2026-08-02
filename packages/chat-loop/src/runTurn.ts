import {
  CONVERSATIONAL_KIND,
  FAILURE_KIND,
  type Clock,
  type ConversationalEnvelope,
  type FailureEnvelope,
} from "@assistant/core";
import type { LLMProvider } from "@assistant/providers";
import {
  insertAssistantMessage,
  insertTurnUsage,
  loadRecentHistory,
  type Database,
} from "@assistant/db";
import { buildUserMessageEnvelope } from "./contextEnvelope.js";

const DEFAULT_HISTORY_LIMIT = 20;
const GENERIC_FAILURE_MESSAGE =
  "Sorry, something went wrong talking to the model. Please try again.";

export interface RunTurnParams {
  database: Database;
  provider: LLMProvider;
  systemPrompt: string;
  sessionId: string;
  clock: Clock;
  ownerTimezone: string;
  historyLimit?: number;
  /**
   * Called with the real error on a provider failure, before the generic
   * envelope is returned — the caller's chance to log it server-side. The
   * envelope itself never carries it (see the spec's Security section:
   * never echo a raw provider error to the user). Optional so a test can
   * omit it entirely.
   */
  onError?: (error: unknown) => void;
}

export type RunTurnEnvelope = ConversationalEnvelope | FailureEnvelope;

export interface RunTurnResult {
  envelope: RunTurnEnvelope;
}

/**
 * The conversational call path (Requirement 8): appends to history, and
 * converts any failure into a user-visible envelope rather than throwing —
 * the inverse of workflowCompletion.ts. Owns its own persistence (message +
 * turn_usage) since chat-loop already depends on packages/db; the caller's
 * job is only to have already persisted the user's own message (so history
 * here ends with it) and to render/send whatever envelope comes back.
 */
export async function runTurn(params: RunTurnParams): Promise<RunTurnResult> {
  const now = params.clock.now(); // read exactly once for this turn

  const history = await loadRecentHistory(
    params.database,
    params.sessionId,
    params.historyLimit ?? DEFAULT_HISTORY_LIMIT,
  );

  if (history.length === 0) {
    throw new Error(
      "runTurn called with empty history — the caller must persist the user's message before calling runTurn.",
    );
  }

  const lastIndex = history.length - 1;
  const providerMessages = history.map((row, index) => ({
    role: row.role,
    content:
      index === lastIndex && row.role === "user"
        ? buildUserMessageEnvelope(now, params.ownerTimezone, row.content)
        : row.content,
  }));

  const startedAtMs = performance.now();
  try {
    const result = await params.provider.complete({
      systemPrompt: params.systemPrompt,
      messages: providerMessages,
    });
    const latencyMs = Math.round(performance.now() - startedAtMs);

    await insertAssistantMessage(params.database, {
      sessionId: params.sessionId,
      content: result.text,
    });
    await insertTurnUsage(params.database, {
      sessionId: params.sessionId,
      provider: params.provider.name,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      latencyMs,
      outcome: "success",
    });

    const envelope: ConversationalEnvelope = {
      status: "success",
      kind: CONVERSATIONAL_KIND,
      data: { text: result.text },
    };
    return { envelope };
  } catch (error) {
    params.onError?.(error);
    const latencyMs = Math.round(performance.now() - startedAtMs);

    await insertTurnUsage(params.database, {
      sessionId: params.sessionId,
      provider: params.provider.name,
      model: params.provider.model,
      inputTokens: null,
      outputTokens: null,
      latencyMs,
      outcome: "failure",
    });

    // Never the raw error text — see the spec's Security section.
    const envelope: FailureEnvelope = {
      status: "error",
      kind: FAILURE_KIND,
      data: { message: GENERIC_FAILURE_MESSAGE },
    };
    return { envelope };
  }
}
