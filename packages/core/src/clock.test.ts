import { describe, expect, it } from "vitest";
import { FixedClock } from "./clock.js";

describe("FixedClock", () => {
  it("always returns the instant it was constructed with", () => {
    const instant = new Date("2026-08-03T07:00:00.000Z");
    const clock = new FixedClock(instant);

    expect(clock.now()).toBe(instant);
    expect(clock.now()).toBe(instant);
  });
});
