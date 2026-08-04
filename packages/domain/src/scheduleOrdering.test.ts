import { describe, expect, it } from "vitest";
import type { PlacementCandidate } from "./placement.js";
import { applyDependencyOrder } from "./scheduleOrdering.js";

function ids(candidates: readonly PlacementCandidate[]): string[] {
  return candidates.map((c) => c.id);
}

describe("applyDependencyOrder", () => {
  it("leaves an already-correct ordering untouched", () => {
    const candidates: PlacementCandidate[] = [
      { id: "a", durationMinutes: 30 },
      { id: "b", durationMinutes: 30, dependsOn: ["a"] },
    ];
    expect(ids(applyDependencyOrder(candidates))).toEqual(["a", "b"]);
  });

  it("moves a dependency ahead of a dependent the model placed first", () => {
    const candidates: PlacementCandidate[] = [
      { id: "mock-exam", durationMinutes: 60, dependsOn: ["module-4"] },
      { id: "module-4", durationMinutes: 60 },
    ];
    expect(ids(applyDependencyOrder(candidates))).toEqual(["module-4", "mock-exam"]);
  });

  it("resolves a three-task chain regardless of the model's order", () => {
    const candidates: PlacementCandidate[] = [
      { id: "c", durationMinutes: 30, dependsOn: ["b"] },
      { id: "a", durationMinutes: 30 },
      { id: "b", durationMinutes: 30, dependsOn: ["a"] },
    ];
    expect(ids(applyDependencyOrder(candidates))).toEqual(["a", "b", "c"]);
  });

  it("resolves a diamond (both b and c depend on a, d depends on both)", () => {
    const candidates: PlacementCandidate[] = [
      { id: "d", durationMinutes: 30, dependsOn: ["b", "c"] },
      { id: "c", durationMinutes: 30, dependsOn: ["a"] },
      { id: "b", durationMinutes: 30, dependsOn: ["a"] },
      { id: "a", durationMinutes: 30 },
    ];
    const result = ids(applyDependencyOrder(candidates));
    expect(result.indexOf("a")).toBeLessThan(result.indexOf("b"));
    expect(result.indexOf("a")).toBeLessThan(result.indexOf("c"));
    expect(result.indexOf("b")).toBeLessThan(result.indexOf("d"));
    expect(result.indexOf("c")).toBeLessThan(result.indexOf("d"));
  });

  it("preserves the model's relative order among candidates with no dependency conflict", () => {
    const candidates: PlacementCandidate[] = [
      { id: "x", durationMinutes: 30 },
      { id: "y", durationMinutes: 30 },
      { id: "z", durationMinutes: 30 },
    ];
    expect(ids(applyDependencyOrder(candidates))).toEqual(["x", "y", "z"]);
  });

  it("treats a dependency outside the candidate set as unconstrained (no-op)", () => {
    const candidates: PlacementCandidate[] = [{ id: "a", durationMinutes: 30, dependsOn: ["not-in-this-run"] }];
    expect(ids(applyDependencyOrder(candidates))).toEqual(["a"]);
  });

  it("does not loop forever if a cycle somehow reaches it", () => {
    const candidates: PlacementCandidate[] = [
      { id: "a", durationMinutes: 30, dependsOn: ["b"] },
      { id: "b", durationMinutes: 30, dependsOn: ["a"] },
    ];
    const result = applyDependencyOrder(candidates);
    expect(result).toHaveLength(2);
    expect(new Set(ids(result))).toEqual(new Set(["a", "b"]));
  });
});
