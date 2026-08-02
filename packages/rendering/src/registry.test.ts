import { describe, expect, it } from "vitest";
import { RenderRegistry, UnregisteredRenderKindError } from "./registry.js";
import { CONVERSATIONAL_KIND, renderConversational } from "./conversational.js";
import type { ResponseEnvelope } from "@assistant/core";

describe("RenderRegistry", () => {
  it("renders via the registered renderer for an envelope's kind", () => {
    const registry = new RenderRegistry().register(CONVERSATIONAL_KIND, renderConversational);
    const envelope: ResponseEnvelope = {
      status: "success",
      kind: CONVERSATIONAL_KIND,
      data: { text: "hello" },
    };

    expect(registry.render(envelope, { timezone: "UTC" })).toBe("hello");
  });

  it("throws UnregisteredRenderKindError for an unregistered kind", () => {
    const registry = new RenderRegistry();
    const envelope: ResponseEnvelope = { status: "success", kind: "mystery", data: {} };

    expect(() => registry.render(envelope, { timezone: "UTC" })).toThrow(
      UnregisteredRenderKindError,
    );
  });

  it("is pure: identical input produces identical output on repeat calls", () => {
    const registry = new RenderRegistry().register(CONVERSATIONAL_KIND, renderConversational);
    const envelope: ResponseEnvelope = {
      status: "success",
      kind: CONVERSATIONAL_KIND,
      data: { text: "hello" },
    };

    const first = registry.render(envelope, { timezone: "UTC" });
    const second = registry.render(envelope, { timezone: "UTC" });
    expect(first).toBe(second);
  });

  it("passes short text through unchanged", () => {
    const registry = new RenderRegistry().register(CONVERSATIONAL_KIND, renderConversational);
    const envelope: ResponseEnvelope = { status: "success", kind: CONVERSATIONAL_KIND, data: { text: "short" } };
    expect(registry.render(envelope, { timezone: "UTC" })).toBe("short");
  });

  it("truncates text over Discord's 2000-character limit with a visible marker", () => {
    const registry = new RenderRegistry().register(CONVERSATIONAL_KIND, renderConversational);
    const longText = "x".repeat(2500);
    const envelope: ResponseEnvelope = { status: "success", kind: CONVERSATIONAL_KIND, data: { text: longText } };

    const rendered = registry.render(envelope, { timezone: "UTC" });

    expect(rendered.length).toBe(2000);
    expect(rendered).toContain("[…truncated]");
    expect(rendered.startsWith("x".repeat(100))).toBe(true);
  });

  it("does not truncate text at exactly the limit", () => {
    const registry = new RenderRegistry().register(CONVERSATIONAL_KIND, renderConversational);
    const exactText = "x".repeat(2000);
    const envelope: ResponseEnvelope = { status: "success", kind: CONVERSATIONAL_KIND, data: { text: exactText } };

    expect(registry.render(envelope, { timezone: "UTC" })).toBe(exactText);
  });
});
