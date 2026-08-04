/**
 * Type declaration for render.mjs — kept separate since the module itself
 * must stay plain, build-step-free JS (it ships byte-for-byte to the
 * browser). NodeNext module resolution picks this up automatically for any
 * TypeScript importer, e.g. apps/server/src/viewerPage.test.ts.
 */
export function formatDateTime(value: unknown): string;
export function cellText(value: unknown): string;
export function emptyStateLabel(entityLabel: string): string;
export const ERROR_STATE_LABEL: string;
export function projectTitleFor(
  task: { projectId: string | null },
  projects: { projectId: string; title: string }[],
): string;
