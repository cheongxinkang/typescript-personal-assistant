import path from "node:path";
import { describe, expect, it } from "vitest";
import { cruise } from "dependency-cruiser";
import ruleSet from "../.dependency-cruiser.cjs";

/**
 * Proves the boundary rule in docs/ARCHITECTURE.md §1 is actually enforced,
 * per phase-1-implementation-plan.md Stage 0's exit criterion: "a
 * deliberate boundary violation fails a test." Runs against a small fixture
 * (tests/fixtures/boundary-violation) rather than the real codebase, so this
 * test stays green regardless of what packages/tools and packages/agents
 * contain later.
 *
 * The rule paths (e.g. "^packages/tools") are anchored to the real repo
 * root, so dependency-cruiser must be run with the fixture directory itself
 * as cwd — otherwise reported source paths are prefixed with
 * "tests/fixtures/boundary-violation/" and never match.
 *
 * `cruise()`'s CLI wrapper (which `pnpm run deps:check` uses via
 * `depcruise --config .dependency-cruiser.cjs`) merges the config file's
 * top-level `options` into the effective cruise options and defaults
 * `validate` to true whenever a ruleSet is present. The programmatic API
 * used here does neither automatically — `validate` defaults to false, and
 * `ruleSet.options` is inert unless spread into cruiseOptions explicitly —
 * so both are done by hand below. This only affects this test, not the real
 * `deps:check` script.
 */
async function cruiseFixture(
  fixtureDirName: string,
): Promise<{ summary: { violations: Array<{ rule: { name: string } }>; error: number } }> {
  const fixtureRoot = path.resolve(import.meta.dirname, "fixtures", fixtureDirName);
  const originalCwd = process.cwd();
  process.chdir(fixtureRoot);

  // options.tsConfig points at the repo root's tsconfig.json by relative
  // path, which resolves against cwd. It only supports path-alias
  // resolution the fixtures don't use, so it's dropped here rather than
  // resolved against the fixture root.
  const { tsConfig: _tsConfig, ...optionsWithoutTsConfig } = ruleSet.options;

  try {
    const result = await cruise(
      ["packages"],
      {
        ruleSet: { forbidden: ruleSet.forbidden },
        outputType: "json",
        validate: true,
        ...optionsWithoutTsConfig,
      },
      undefined,
      undefined,
    );
    return typeof result.output === "string" ? JSON.parse(result.output) : result.output;
  } finally {
    process.chdir(originalCwd);
  }
}

describe("dependency boundary rules", () => {
  it("flags packages/tools importing packages/agents as a violation", async () => {
    const output = await cruiseFixture("boundary-violation");

    const violation = output.summary.violations.find(
      (v) => v.rule.name === "no-tools-importing-agents-or-channels",
    );

    expect(violation).toBeDefined();
    expect(output.summary.error).toBeGreaterThan(0);
  });

  it("flags packages/domain importing packages/tools as a violation", async () => {
    const output = await cruiseFixture("domain-boundary-violation");

    const violation = output.summary.violations.find(
      (v) => v.rule.name === "no-domain-importing-upper-layers",
    );

    expect(violation).toBeDefined();
    expect(output.summary.error).toBeGreaterThan(0);
  });
});
