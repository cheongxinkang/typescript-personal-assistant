/**
 * These two render a batch workflow's *completion* — an unprompted message
 * sent minutes to hours after the turn that submitted it. Unlike every
 * other renderer in this package, there is no ResponseEnvelope/`kind` for
 * either: they're never reached through runTurn's tool-result pipeline,
 * only called directly by apps/server's poll-tick apply step. Kept in
 * packages/rendering anyway, since platform-facing prose still belongs
 * here and nowhere else (ARCHITECTURE.md §2).
 */

export function renderProjectBreakdownApplied(data: {
  projectTitle: string;
  appliedCount: number;
  discardedCount: number;
}): string {
  const discardNote =
    data.discardedCount > 0
      ? ` (${data.discardedCount} generated ${data.discardedCount === 1 ? "task was" : "tasks were"} discarded — over the size limit or malformed)`
      : "";
  if (data.appliedCount === 0) {
    return `Project "${data.projectTitle}": no usable tasks were generated${discardNote}. You can add tasks to it by hand.`;
  }
  return `Project "${data.projectTitle}" is ready — ${data.appliedCount} task${data.appliedCount === 1 ? "" : "s"} generated${discardNote}.`;
}

export function renderProjectBreakdownFailed(data: { category: string }): string {
  return `Sorry — generating tasks for that project failed (${data.category}). You can add tasks to it by hand, or try creating the project again.`;
}

export function renderScheduleGenerationApplied(data: {
  placedCount: number;
  overflowCount: number;
  generationRunId: string;
}): string {
  const overflowNote =
    data.overflowCount > 0
      ? ` ${data.overflowCount} task${data.overflowCount === 1 ? "" : "s"} didn't fit in the horizon and ${data.overflowCount === 1 ? "was" : "were"} left unscheduled.`
      : "";
  if (data.placedCount === 0) {
    return `Schedule proposal ready — nothing could be placed in the horizon.${overflowNote} Nothing to confirm.`;
  }
  return `Schedule proposal ready — ${data.placedCount} event${data.placedCount === 1 ? "" : "s"} proposed.${overflowNote} Say the word to confirm it (id: ${data.generationRunId}).`;
}

export function renderScheduleGenerationFailed(data: { category: string }): string {
  return `Sorry — generating your schedule proposal failed (${data.category}). Nothing was changed; you can try again.`;
}
