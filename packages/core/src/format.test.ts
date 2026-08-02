import { describe, expect, it } from "vitest";
import { formatDateTime, formatIsoWithZone } from "./format.js";

describe("formatDateTime", () => {
  it("renders weekday, day, month name, and year — never MM/DD", () => {
    // 2026-08-02T23:00:00.000Z = 2026-08-03T07:00 in Asia/Singapore (Monday).
    const date = new Date("2026-08-02T23:00:00.000Z");
    const rendered = formatDateTime(date, "Asia/Singapore");

    expect(rendered).toBe("7:00 AM, Monday 3 August 2026");
    expect(rendered).not.toMatch(/\d{1,2}\/\d{1,2}/);
  });

  it("renders a PM time correctly", () => {
    const date = new Date("2026-08-03T11:00:00.000Z"); // 19:00 SGT
    expect(formatDateTime(date, "Asia/Singapore")).toBe("7:00 PM, Monday 3 August 2026");
  });

  it("respects the given timezone, not the host's", () => {
    const date = new Date("2026-08-02T23:00:00.000Z");
    const singapore = formatDateTime(date, "Asia/Singapore"); // Aug 3, 07:00
    const newYork = formatDateTime(date, "America/New_York"); // Aug 2, 19:00 (EDT)

    expect(singapore).toBe("7:00 AM, Monday 3 August 2026");
    expect(newYork).toBe("7:00 PM, Sunday 2 August 2026");
  });
});

describe("formatIsoWithZone", () => {
  it("renders ISO-8601 with the zone's offset", () => {
    const date = new Date("2026-08-02T23:00:00.000Z");
    expect(formatIsoWithZone(date, "Asia/Singapore")).toBe("2026-08-03T07:00:00.000+08:00");
  });
});
