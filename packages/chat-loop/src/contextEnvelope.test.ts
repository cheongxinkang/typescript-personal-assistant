import { describe, expect, it } from "vitest";
import { buildUserMessageEnvelope } from "./contextEnvelope.js";

describe("buildUserMessageEnvelope", () => {
  it("prefixes the current instant and timezone ahead of the user's text", () => {
    const now = new Date("2026-08-02T23:00:00.000Z"); // 2026-08-03T07:00 SGT
    const wrapped = buildUserMessageEnvelope(now, "Asia/Singapore", "Add dinner tomorrow at 7pm");

    expect(wrapped).toBe(
      "[Current time: 2026-08-03T07:00:00.000+08:00 (Asia/Singapore)]\n\nAdd dinner tomorrow at 7pm",
    );
  });

  it("leaves the original user text intact, unmodified, inside the envelope", () => {
    const now = new Date("2026-08-02T23:00:00.000Z");
    const userText = "What's on my schedule?";
    const wrapped = buildUserMessageEnvelope(now, "Asia/Singapore", userText);

    expect(wrapped.endsWith(userText)).toBe(true);
  });
});
