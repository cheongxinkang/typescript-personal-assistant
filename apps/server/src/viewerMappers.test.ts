import { describe, expect, it } from "vitest";
import {
  parseLimit,
  toEventView,
  toMessageView,
  toProjectView,
  toTaskView,
  toTurnUsageView,
  VIEWER_DEFAULT_LIMIT,
  VIEWER_MAX_LIMIT,
} from "./viewerMappers.js";

describe("viewer mappers", () => {
  it("toProjectView narrows to exactly the spec'd fields, dropping description", () => {
    const view = toProjectView({
      rowId: "r1",
      projectId: "p1",
      userId: "u1",
      title: "T",
      description: "should not appear",
      targetDate: null,
      status: "active",
      taskGenerationStatus: "ready",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    } as never);
    expect(Object.keys(view).sort()).toEqual(
      ["projectId", "title", "status", "taskGenerationStatus", "targetDate", "createdAt"].sort(),
    );
  });

  it("toTaskView narrows to exactly the spec'd fields, dropping description/source", () => {
    const view = toTaskView({
      rowId: "r1",
      taskId: "t1",
      userId: "u1",
      projectId: null,
      title: "T",
      description: "should not appear",
      estimatedMinutes: null,
      deadline: null,
      status: "open",
      source: "user",
      completedAt: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    } as never);
    expect(Object.keys(view).sort()).toEqual(
      ["taskId", "title", "status", "deadline", "estimatedMinutes", "projectId", "createdAt"].sort(),
    );
  });

  it("toEventView narrows to exactly the spec'd fields, dropping lineage fields", () => {
    const view = toEventView({
      rowId: "r1",
      eventId: "e1",
      userId: "u1",
      title: "T",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      durationMinutes: 30,
      status: "planned",
      taskId: null,
      parentEventId: "should-not-appear",
      partIndex: null,
      movedFromEventId: null,
      actualMinutes: null,
      sourceMessageId: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    } as never);
    expect(Object.keys(view).sort()).toEqual(
      ["eventId", "title", "startsAt", "durationMinutes", "status", "taskId", "createdAt"].sort(),
    );
  });

  it("toMessageView narrows to exactly the spec'd fields, dropping the row id", () => {
    const view = toMessageView({
      id: "should-not-appear",
      sessionId: "s1",
      role: "user",
      content: "hi",
      platformMessageId: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    } as never);
    expect(Object.keys(view).sort()).toEqual(
      ["sessionId", "role", "content", "platformMessageId", "createdAt"].sort(),
    );
  });

  it("toTurnUsageView narrows to exactly the spec'd fields, dropping the row id, and preserves null token counts", () => {
    const view = toTurnUsageView({
      id: "should-not-appear",
      sessionId: "s1",
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: 0,
      latencyMs: 10,
      outcome: "failure",
      toolCalls: 0,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    } as never);
    expect(Object.keys(view).sort()).toEqual(
      [
        "sessionId",
        "provider",
        "model",
        "inputTokens",
        "outputTokens",
        "cacheReadTokens",
        "latencyMs",
        "outcome",
        "toolCalls",
        "createdAt",
      ].sort(),
    );
    expect(view.inputTokens).toBeNull();
    expect(view.outputTokens).toBeNull();
  });
});

describe("parseLimit", () => {
  it("defaults to 100 when no limit is given", () => {
    expect(parseLimit(undefined)).toBe(VIEWER_DEFAULT_LIMIT);
  });

  it("passes through an in-range integer", () => {
    expect(parseLimit("42")).toBe(42);
  });

  it("clamps a value above the ceiling to 500", () => {
    expect(parseLimit("999999")).toBe(VIEWER_MAX_LIMIT);
  });

  it("resets zero to the default", () => {
    expect(parseLimit("0")).toBe(VIEWER_DEFAULT_LIMIT);
  });

  it("resets a negative value to the default", () => {
    expect(parseLimit("-5")).toBe(VIEWER_DEFAULT_LIMIT);
  });

  it("resets a non-numeric value to the default", () => {
    expect(parseLimit("abc")).toBe(VIEWER_DEFAULT_LIMIT);
  });

  it("resets a non-integer value to the default", () => {
    expect(parseLimit("3.5")).toBe(VIEWER_DEFAULT_LIMIT);
  });
});
