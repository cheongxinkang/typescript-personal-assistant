// Pure, DOM-free logic for the DB-visibility viewer page. Plain ESM, no
// build step — this exact file ships to the browser (served by
// apps/server/src/viewer.ts's GET /render.mjs) and is imported directly by
// vitest for unit tests, so there is no separate "tested" copy to drift
// from what actually runs.

export function formatDateTime(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleString();
}

// Never renders "null"/"undefined" as text (Failure and edge cases table).
export function cellText(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return String(value);
}

export function emptyStateLabel(entityLabel) {
  return `No ${entityLabel} yet.`;
}

export const ERROR_STATE_LABEL = "Couldn't load this — try reloading the page.";

/**
 * Requirement 10: a task's projectId is rendered as the project's title via
 * a client-side join against the already-fetched /api/projects response —
 * never a second round trip. Handles three cases explicitly: no project
 * (null projectId), and a projectId with no matching project (a dangling
 * reference — see phase_2a-db-visibility.md's Failure and edge cases table)
 * both resolve to blank, never a thrown error or a raw UUID.
 */
export function projectTitleFor(task, projects) {
  if (!task.projectId) {
    return "";
  }
  const match = projects.find((project) => project.projectId === task.projectId);
  return match ? match.title : "";
}
