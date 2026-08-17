import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureOwnerUser, insertEventRow, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { updateEventTool } from "./updateEvent.js";
import type { ToolContext } from "./toolDefinition.js";

describe("updateEventTool.handler", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function context(now: Date): ToolContext {
    return { database: testDb.database, now, ownerTimezone: "Asia/Singapore", ownerUserId: OWNER_USER_ID };
  }

  it("re-validates the flat wire input against the discriminated domain schema and cancels an event", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const event = await insertEventRow(testDb.database, {
      userId: OWNER_USER_ID,
      title: "No longer needed",
      startsAt: new Date("2026-08-03T01:00:00.000Z"),
      durationMinutes: 30,
    });

    const result = await updateEventTool.handler(
      { action: "cancel", eventId: event.eventId },
      context(now),
    );

    expect(result.status).toBe("cancelled");
  });
});
