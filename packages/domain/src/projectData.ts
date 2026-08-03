import type { ProjectData } from "@assistant/core";
import type { ProjectRow } from "@assistant/db";

export function toProjectData(row: ProjectRow): ProjectData {
  return {
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    targetDate: row.targetDate ? row.targetDate.toISOString() : null,
    status: row.status,
    taskGenerationStatus: row.taskGenerationStatus,
  };
}
