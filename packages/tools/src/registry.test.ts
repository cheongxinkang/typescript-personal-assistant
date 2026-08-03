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

  it("ALL_TOOLS contains all nine tools shipped through Stage 7", () => {
    expect(ALL_TOOLS.map((t) => t.name)).toEqual([
      "get_schedule",
      "add_event",
      "update_event",
      "add_task",
      "update_task",
      "add_project",
      "generate_schedule",
      "confirm_schedule",
      "list_tasks",
    ]);
  });

  it("every tool declares an envelope kind, per Requirement 13/28", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.kind).toBeTruthy();
    }
  });
});
