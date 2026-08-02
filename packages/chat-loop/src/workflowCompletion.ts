import type { LLMProvider } from "@assistant/providers";

export interface WorkflowCompletionParams {
  provider: LLMProvider;
  systemPrompt: string;
  userText: string;
}

/**
 * The computed/scheduled call path (Requirement 8): no tools, touches no
 * history, persists nothing — and, critically, THROWS on failure rather
 * than returning an error envelope. The inverse of runTurn.ts's failure
 * semantics on purpose: a caller that cannot distinguish success from
 * failure will silently consume state (ARCHITECTURE.md §3.2). No
 * production caller exists in this phase; every scheduled job from Stage 5
 * onward depends on this existing now rather than being retrofitted later.
 */
export async function workflowCompletion(params: WorkflowCompletionParams): Promise<string> {
  const result = await params.provider.complete({
    systemPrompt: params.systemPrompt,
    messages: [{ role: "user", content: params.userText }],
  });
  return result.text;
}
