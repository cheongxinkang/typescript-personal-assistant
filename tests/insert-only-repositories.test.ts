import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ARCHITECTURE.md §4: projects, tasks, and events are insert-only — a
 * revision is a new row, never an UPDATE, never a DELETE outside retention.
 * This was previously only a code comment ("there is deliberately no
 * update/delete function here"); this test makes it a structural
 * assertion that fails the build if a future change (Stage 3's lifecycle
 * operations included) reaches for `.update()` or `.delete()` against one
 * of these three tables instead of building a carried-forward insert.
 */
describe("insert-only repositories", () => {
  const domainRepositoryFiles = ["events.ts", "projects.ts", "tasks.ts"];

  it.each(domainRepositoryFiles)("%s never calls .update( or .delete(", (fileName) => {
    const filePath = path.resolve(import.meta.dirname, "../packages/db/src/repositories", fileName);
    const source = readFileSync(filePath, "utf8");

    expect(source).not.toMatch(/\.update\(/);
    expect(source).not.toMatch(/\.delete\(/);
  });
});
