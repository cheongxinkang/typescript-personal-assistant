import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DayShapeConfigError, loadDayShape } from "./dayShape.js";

describe("loadDayShape", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    tmpDir = undefined;
  });

  function writeTempFile(contents: string): string {
    tmpDir = mkdtempSync(path.join(tmpdir(), "day-shape-test-"));
    const filePath = path.join(tmpDir, "day-shape.yaml");
    writeFileSync(filePath, contents, "utf8");
    return filePath;
  }

  it("loads the checked-in config/day-shape.yaml successfully", () => {
    const dayShape = loadDayShape(path.resolve(import.meta.dirname, "../../../config/day-shape.yaml"));
    expect(dayShape.monday).toBeDefined();
  });

  it("fails fast, naming the path, when the file does not exist", () => {
    expect(() => loadDayShape("does/not/exist.yaml")).toThrow(DayShapeConfigError);
  });

  it("fails fast, naming the field, on an invalid time format", () => {
    const filePath = writeTempFile("monday:\n  start: \"9am\"\n  end: \"17:00\"\n");
    expect(() => loadDayShape(filePath)).toThrow(DayShapeConfigError);
  });

  it("fails fast when start is not before end", () => {
    const filePath = writeTempFile("monday:\n  start: \"17:00\"\n  end: \"09:00\"\n");
    expect(() => loadDayShape(filePath)).toThrow(DayShapeConfigError);
  });

  it("accepts a day with no entry as fully unschedulable", () => {
    const filePath = writeTempFile("monday:\n  start: \"09:00\"\n  end: \"17:00\"\n");
    const dayShape = loadDayShape(filePath);
    expect(dayShape.sunday).toBeUndefined();
  });
});
