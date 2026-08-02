import type { LLMCompleteParams, LLMProvider, LLMResult } from "./provider.js";

/**
 * Scripted responses, consumed in order. A queued Error is thrown rather
 * than returned, so tests can exercise both of chat-loop's failure paths
 * (runTurn converts it to a message, workflowCompletion propagates it)
 * without a real network call.
 */
export class FakeProvider implements LLMProvider {
  readonly name = "fake";
  readonly model = "fake-model";
  readonly calls: LLMCompleteParams[] = [];
  private readonly queue: Array<LLMResult | Error>;

  constructor(responses: Array<LLMResult | Error> = []) {
    this.queue = [...responses];
  }

  async complete(params: LLMCompleteParams): Promise<LLMResult> {
    this.calls.push(params);
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error("FakeProvider: no scripted response left for this call.");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }
}
