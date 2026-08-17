import { describe, expect, it } from "vitest";
import { FakeBatchProvider } from "./fakeBatch.js";

describe("FakeBatchProvider", () => {
  it("returns the scripted status and results for a submitted batch", async () => {
    const provider = new FakeBatchProvider();
    const providerBatchId = provider.scriptNextBatch(
      [{ status: "ended", requestCounts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 }, endedAt: new Date() }],
      [{ customId: "c1", outcome: { type: "succeeded", text: "hi", model: "fake", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } } }],
    );

    const submission = await provider.submit([{ customId: "c1", systemPrompt: "sys", messages: [] }]);
    expect(submission.providerBatchId).toBe(providerBatchId);

    const status = await provider.checkStatus(providerBatchId);
    expect(status.status).toBe("ended");

    const results = await provider.fetchResults(providerBatchId);
    expect(results).toHaveLength(1);
    expect(results[0]?.outcome.type).toBe("succeeded");
  });

  it("returns each scripted status in sequence across repeated checkStatus calls", async () => {
    const provider = new FakeBatchProvider();
    const providerBatchId = provider.scriptNextBatch(
      [
        { status: "in_progress", requestCounts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 }, endedAt: null },
        { status: "ended", requestCounts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 }, endedAt: new Date() },
      ],
      [],
    );
    await provider.submit([{ customId: "c1", systemPrompt: "sys", messages: [] }]);

    expect((await provider.checkStatus(providerBatchId)).status).toBe("in_progress");
    expect((await provider.checkStatus(providerBatchId)).status).toBe("ended");
    // Stays on the last scripted status once exhausted.
    expect((await provider.checkStatus(providerBatchId)).status).toBe("ended");
  });

  it("throws when checkStatus is called for an unscripted batch id", async () => {
    const provider = new FakeBatchProvider();
    await expect(provider.checkStatus("not-registered")).rejects.toThrow();
  });
});
