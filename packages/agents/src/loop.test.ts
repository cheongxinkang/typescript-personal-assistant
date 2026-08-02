import { describe, expect, it } from "vitest";
import { FakeProvider } from "@assistant/providers";
import { runAgentTurn } from "./loop.js";
import { buildTestMcpClient, TEST_TOOL_DEFINITION } from "./testHelpers/mcp.js";

describe("runAgentTurn", () => {
  it("returns outcome 'text' with no tool call, making exactly one provider call", async () => {
    const provider = new FakeProvider([
      { text: "hello there", model: "m", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } },
    ]);
    const mcpClient = await buildTestMcpClient(() => ({}));

    const result = await runAgentTurn({
      provider,
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      mcpClient,
      tools: [],
    });

    expect(result).toMatchObject({ outcome: "text", text: "hello there", providerCallCount: 1, toolCallCount: 0 });
  });

  it("stops at a successful tool call — no narration round-trip (Requirement 14)", async () => {
    const provider = new FakeProvider([
      {
        text: "",
        toolCall: { id: "tu_1", name: "add_event", input: { title: "x", dateExpression: "today" } },
        model: "m",
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
      },
    ]);
    const mcpClient = await buildTestMcpClient(() => ({ structuredContent: { ok: true } }));

    const result = await runAgentTurn({
      provider,
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      mcpClient,
      tools: [TEST_TOOL_DEFINITION],
    });

    expect(result.outcome).toBe("tool_success");
    expect(result.toolResult).toEqual({ ok: true });
    expect(result.providerCallCount).toBe(1);
    expect(result.toolCallCount).toBe(1);
  });

  it("retries a failed tool call, feeding back a proper tool_use/tool_result pair", async () => {
    const provider = new FakeProvider([
      {
        text: "",
        toolCall: { id: "tu_1", name: "add_event", input: { title: "x", dateExpression: "bad" } },
        model: "m",
        usage: { inputTokens: 3, outputTokens: 1, cacheReadTokens: 0 },
      },
      {
        text: "",
        toolCall: { id: "tu_2", name: "add_event", input: { title: "x", dateExpression: "today" } },
        model: "m",
        usage: { inputTokens: 4, outputTokens: 1, cacheReadTokens: 0 },
      },
    ]);
    let attempt = 0;
    const mcpClient = await buildTestMcpClient(() => {
      attempt += 1;
      return attempt === 1 ? { isError: true, errorText: "bad date" } : { structuredContent: { ok: true } };
    });

    const result = await runAgentTurn({
      provider,
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      mcpClient,
      tools: [TEST_TOOL_DEFINITION],
    });

    expect(result.outcome).toBe("tool_success");
    expect(result.providerCallCount).toBe(2);
    expect(result.toolCallCount).toBe(2);
    // Usage is summed across both provider calls, not just the last one —
    // a retry is a real, billed call.
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 2, cacheReadTokens: 0 });

    const secondCallMessages = provider.calls[1]?.messages ?? [];
    const toolUseMsg = secondCallMessages.find(
      (m) => m.role === "assistant" && Array.isArray(m.content) && m.content[0]?.type === "tool_use",
    );
    const toolResultMsg = secondCallMessages.find(
      (m) => m.role === "user" && Array.isArray(m.content) && m.content[0]?.type === "tool_result",
    );
    expect(toolUseMsg).toBeDefined();
    expect(toolResultMsg).toBeDefined();
  });

  it("returns 'tool_exhausted' after maxIterations of consistent tool failure", async () => {
    const provider = new FakeProvider(
      Array.from({ length: 3 }, (_, i) => ({
        text: "",
        toolCall: { id: `tu_${i}`, name: "add_event", input: { title: "x", dateExpression: "bad" } },
        model: "m",
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
      })),
    );
    const mcpClient = await buildTestMcpClient(() => ({ isError: true, errorText: "always fails" }));

    const result = await runAgentTurn({
      provider,
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      mcpClient,
      tools: [TEST_TOOL_DEFINITION],
      maxIterations: 3,
    });

    expect(result.outcome).toBe("tool_exhausted");
    expect(result.providerCallCount).toBe(3);
    expect(result.toolCallCount).toBe(3);
  });

  it("returns 'budget_exceeded' when the time budget is already spent before an iteration starts", async () => {
    const provider = new FakeProvider([
      { text: "should not be reached", model: "m", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } },
    ]);
    const mcpClient = await buildTestMcpClient(() => ({}));

    const result = await runAgentTurn({
      provider,
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      mcpClient,
      tools: [],
      timeBudgetMs: -1, // already exceeded before the first iteration
    });

    expect(result.outcome).toBe("budget_exceeded");
    expect(result.providerCallCount).toBe(0);
  });
});
