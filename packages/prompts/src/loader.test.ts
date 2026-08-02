import { describe, expect, it } from "vitest";
import { loadAssistantSystemPrompt } from "./loader.js";

describe("loadAssistantSystemPrompt", () => {
  it("loads a non-empty static string", () => {
    const prompt = loadAssistantSystemPrompt();
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("personal assistant");
  });

  it("is byte-identical across repeated calls — the caching precondition", () => {
    expect(loadAssistantSystemPrompt()).toBe(loadAssistantSystemPrompt());
  });
});
