import { describe, expect, it } from "vitest";
import { FakeProvider } from "@assistant/providers";
import { workflowCompletion } from "./workflowCompletion.js";

describe("workflowCompletion", () => {
  it("returns the model's text for a single-shot, tool-less call", async () => {
    const provider = new FakeProvider([
      { text: "42", model: "fake-model", usage: { inputTokens: 5, outputTokens: 1, cacheReadTokens: 0 } },
    ]);

    const result = await workflowCompletion({
      provider,
      systemPrompt: "You are a summarizer.",
      userText: "What is the answer?",
    });

    expect(result).toBe("42");
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.messages).toEqual([
      { role: "user", content: "What is the answer?" },
    ]);
  });

  it("sends no history — exactly one message, always", async () => {
    const provider = new FakeProvider([
      { text: "ok", model: "fake-model", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } },
    ]);

    await workflowCompletion({ provider, systemPrompt: "sys", userText: "hi" });

    expect(provider.calls[0]?.messages).toHaveLength(1);
  });

  it("propagates (throws) a provider failure rather than swallowing it — the inverse of runTurn", async () => {
    const provider = new FakeProvider([new Error("rate limited")]);

    await expect(
      workflowCompletion({ provider, systemPrompt: "sys", userText: "hi" }),
    ).rejects.toThrow("rate limited");
  });
});
