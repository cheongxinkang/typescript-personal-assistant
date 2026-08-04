import { describe, expect, it } from "vitest";
import { renderTaskList } from "./taskList.js";

function task(title: string, deadline: string | null = null) {
  return {
    taskId: title,
    title,
    description: null,
    estimatedMinutes: null,
    deadline,
    status: "open" as const,
    projectId: null,
    orphanedEventIds: [],
    dependsOnTitles: [],
  };
}

describe("renderTaskList", () => {
  it("reports no tasks when there are none", () => {
    expect(renderTaskList({ groups: [] }, { timezone: "Asia/Singapore" })).toBe("No tasks.");
  });

  it("headings each project group by title, and a project-less group as 'Tasks'", () => {
    const text = renderTaskList(
      {
        groups: [
          { projectId: "p1", projectTitle: "project_a", tasks: [task("task_a_under_project_a"), task("task_b_under_project_a")] },
          { projectId: "p2", projectTitle: "project_b", tasks: [task("task_1_under_project_b")] },
          { projectId: null, projectTitle: null, tasks: [task("unrelated_task")] },
        ],
      },
      { timezone: "Asia/Singapore" },
    );

    expect(text).toBe(
      "# project_a\n\n* task_a_under_project_a\n* task_b_under_project_a\n\n" +
        "# project_b\n\n* task_1_under_project_b\n\n" +
        "# Tasks\n\n* unrelated_task",
    );
  });

  it("states the deadline when present", () => {
    const text = renderTaskList(
      { groups: [{ projectId: null, projectTitle: null, tasks: [task("Ship the draft", "2026-08-03T10:00:00.000Z")] }] },
      { timezone: "Asia/Singapore" },
    );
    expect(text).toContain("due");
  });
});
