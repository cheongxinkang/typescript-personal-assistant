import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { DayShapeSchema, type DayShape } from "@assistant/domain";

/**
 * Requirement 1's "a missing or malformed value fails startup with a
 * message naming the variable" applies to this file too — a malformed day
 * shape is exactly as much a "never run half-configured" case as a missing
 * env var (see config.ts's ConfigError).
 */
export class DayShapeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DayShapeConfigError";
  }
}

const DEFAULT_PATH = "config/day-shape.yaml";

/**
 * The file read itself lives here, not in packages/domain — domain must
 * not touch the filesystem (Requirement 2). `path` resolves relative to
 * `process.cwd()`, which is the repo root locally and `/app` in the
 * container (see Dockerfile's `COPY config ./config`) — both have
 * `config/day-shape.yaml` at that relative location.
 */
export function loadDayShape(path: string = process.env.DAY_SHAPE_PATH ?? DEFAULT_PATH): DayShape {
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new DayShapeConfigError(
      `Failed to read or parse day-shape config at "${path}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = DayShapeSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ");
    throw new DayShapeConfigError(`Invalid day-shape config at "${path}": ${fields}`);
  }

  return result.data;
}
