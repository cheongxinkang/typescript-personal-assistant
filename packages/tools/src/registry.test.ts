import { describe, expect, it } from "vitest";
import { ALL_TOOLS, offeredTools } from "./registry.js";

describe("offeredTools", () => {
  it("returns only the enabled tools", () => {
    expect(offeredTools(["add_event"]).map((t) => t.name)).toEqual(["add_event"]);
  });

  it("returns nothing when no tools are enabled", () => {
    expect(offeredTools([])).toEqual([]);
  });

  it("ignores an enabled-tool name that doesn't match any registered tool", () => {
    expect(offeredTools(["not_a_real_tool"])).toEqual([]);
  });

  it("ALL_TOOLS currently contains exactly add_event — Stage 5's scope", () => {
    expect(ALL_TOOLS.map((t) => t.name)).toEqual(["add_event"]);
  });
});
