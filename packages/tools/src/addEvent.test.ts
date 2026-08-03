import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DateExpressionError } from "@assistant/core";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { addEventTool } from "./addEvent.js";
import type { ToolContext } from "./toolDefinition.js";

describe("addEventTool.handler", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function context(now: Date): ToolContext {
    return {
      database: testDb.database,
      now,
      ownerTimezone: "Asia/Singapore",
      ownerUserId: OWNER_USER_ID,
    };
  }

  it("resolves the date expression and returns the row read back after insert", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z"); // Sunday, 12:00 SGT
    const result = await addEventTool.handler(
      { title: "Dinner with Cheryl", dateExpression: "tomorrow 19:00" },
      context(now),
    );

    expect(result.title).toBe("Dinner with Cheryl");
    expect(result.startsAt).toBe("2026-08-03T11:00:00.000Z"); // 2026-08-03T19:00 SGT
    expect(result.eventId).toBeDefined();
    expect(result.durationMinutes).toBe(30); // DEFAULT_EVENT_MINUTES
    expect(result.durationWasDefaulted).toBe(true);
  });

  it("throws DateExpressionError for an unresolvable expression, writing no row", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await expect(
      addEventTool.handler({ title: "Something", dateExpression: "next Thursday-ish" }, context(now)),
    ).rejects.toThrow(DateExpressionError);
  });

  it("stores an optional durationMinutes", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const result = await addEventTool.handler(
      { title: "Standup", dateExpression: "tomorrow 09:00", durationMinutes: 15 },
      context(now),
    );
    expect(result.durationMinutes).toBe(15);
  });
});
