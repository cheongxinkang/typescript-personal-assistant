import { describe, expect, it } from "vitest";
import { renderTaskAdded, renderTaskUpdated } from "./task.js";

describe("renderTaskAdded", () => {
  it("names the task, with no deadline note when there is none", () => {
    const text = renderTaskAdded(
      {
        taskId: "t1",
        title: "Pick a static site generator",
        description: null,
        estimatedMinutes: null,
        deadline: null,
        status: "open",
        projectId: null,
        orphanedEventIds: [],
        dependsOnTitles: [],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toBe("Added task: Pick a static site generator.");
  });

  it("states the deadline when present", () => {
    const text = renderTaskAdded(
      {
        taskId: "t1",
        title: "Ship the draft",
        description: null,
        estimatedMinutes: null,
        deadline: "2026-08-03T10:00:00.000Z",
        status: "open",
        projectId: null,
        orphanedEventIds: [],
        dependsOnTitles: [],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("due");
    expect(text).toContain("6:00 PM");
  });

  it("names its dependencies when present", () => {
    const text = renderTaskAdded(
      {
        taskId: "t1",
        title: "Mock exam",
        description: null,
        estimatedMinutes: null,
        deadline: null,
        status: "open",
        projectId: null,
        orphanedEventIds: [],
        dependsOnTitles: ["Finish module 4"],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("Depends on: Finish module 4.");
  });
});

describe("renderTaskUpdated", () => {
  it("names a completed task and any orphaned events — Requirement 9", () => {
    const text = renderTaskUpdated(
      {
        taskId: "t1",
        title: "Migrate posts",
        description: null,
        estimatedMinutes: null,
        deadline: null,
        status: "completed",
        projectId: null,
        orphanedEventIds: ["e1"],
        dependsOnTitles: [],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("Marked \"Migrate posts\" complete");
    expect(text).toContain("an event");
  });

  it("names a cancelled task", () => {
    const text = renderTaskUpdated(
      {
        taskId: "t1",
        title: "Not needed",
        description: null,
        estimatedMinutes: null,
        deadline: null,
        status: "cancelled",
        projectId: null,
        orphanedEventIds: [],
        dependsOnTitles: [],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toBe("Cancelled task: Not needed.");
  });

  it("names its dependencies on a plain edit", () => {
    const text = renderTaskUpdated(
      {
        taskId: "t1",
        title: "Mock exam",
        description: null,
        estimatedMinutes: null,
        deadline: null,
        status: "open",
        projectId: null,
        orphanedEventIds: [],
        dependsOnTitles: ["Finish module 4"],
      },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toBe("Updated task: Mock exam. Depends on: Finish module 4.");
  });
});
