import { formatDateTime, PROJECT_ADDED_KIND, type ProjectData } from "@assistant/core";
import type { Renderer, RenderContext } from "./registry.js";

/**
 * Requirement 24: an acknowledgement, never phrased as a completed result
 * — when generation is pending, the reply says so explicitly rather than
 * implying tasks already exist.
 */
export const renderProjectAdded: Renderer<ProjectData> = (data: ProjectData, context: RenderContext) => {
  const targetDateNote = data.targetDate
    ? ` — targeting ${formatDateTime(new Date(data.targetDate), context.timezone)}`
    : "";

  if (data.taskGenerationStatus === "pending") {
    return `Started project: ${data.title}${targetDateNote}. Generating tasks for it now — usually a few minutes, sometimes longer. I'll post them here once ready.`;
  }
  return `Started project: ${data.title}${targetDateNote}.`;
};

export { PROJECT_ADDED_KIND };
