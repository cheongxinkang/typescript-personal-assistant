import { describe, expect, it } from "vitest";
import { PromptError } from "./loader.js";
import { loadToolPrompt } from "./toolPrompts.js";

describe("loadToolPrompt", () => {
  it("loads add_event's description and field descriptions", () => {
    const prompt = loadToolPrompt("add_event");
    expect(prompt.description.length).toBeGreaterThan(0);
    expect(prompt.fields.title).toBeDefined();
    expect(prompt.fields.dateExpression).toBeDefined();
  });

  it("throws PromptError, naming the tool, for an unknown tool", () => {
    expect(() => loadToolPrompt("not_a_real_tool")).toThrow(PromptError);
    try {
      loadToolPrompt("not_a_real_tool");
    } catch (error) {
      expect((error as PromptError).message).toContain("not_a_real_tool");
    }
  });
});
