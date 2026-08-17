import { formatDateTime, GENERATION_SUBMITTED_KIND, type GenerationSubmittedData } from "@assistant/core";
import type { Renderer, RenderContext } from "./registry.js";

/** Requirement 25: an acknowledgement — the real result is a later, separate message. */
export const renderGenerationSubmitted: Renderer<GenerationSubmittedData> = (
  data: GenerationSubmittedData,
  context: RenderContext,
) => {
  const start = formatDateTime(new Date(data.horizonStart), context.timezone);
  const end = formatDateTime(new Date(data.horizonEnd), context.timezone);

  if (!data.submitted) {
    return `No open, unscheduled tasks to plan for between ${start} and ${end}.`;
  }
  return `Planning your schedule from ${start} to ${end} — I'll post the proposal here once it's ready.`;
};

export { GENERATION_SUBMITTED_KIND };
