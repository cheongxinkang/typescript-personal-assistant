import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DateExpressionError } from "@assistant/core";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { addEvent, addEventInputSchema } from "./addEvent.js";
import type { DomainContext } from "./context.js";

/**
 * The domain function's own tests, importing it by relative path within
 * this package — unlike packages/tools/src/addEvent.contract.test.ts, which
 * necessarily consumes @assistant/domain cross-package (compiled dist) to
 * prove the tool adapter delegates correctly. Vitest only instruments
 * same-package relative imports for coverage, so this file is what makes
 * packages/domain count toward its own coverage gate — the contract test
 * alone does not, discovered while wiring up Stage 1's coverage include.
 */
describe("addEvent (domain)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function context(now: Date): DomainContext {
    return { now, ownerTimezone: "Asia/Singapore", ownerUserId: OWNER_USER_ID };
  }

  it("resolves the date expression and returns the row read back after insert", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z"); // Sunday, 12:00 SGT
    const result = await addEvent(
      testDb.database,
      { title: "Dinner with Cheryl", dateExpression: "tomorrow 19:00" },
      context(now),
    );

    expect(result.title).toBe("Dinner with Cheryl");
    expect(result.startsAt).toBe("2026-08-03T11:00:00.000Z"); // 2026-08-03T19:00 SGT
    expect(result.eventId).toBeDefined();
    expect(result.durationMinutes).toBeNull();
  });

  it("throws DateExpressionError for an unresolvable expression, writing no row", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    await expect(
      addEvent(testDb.database, { title: "Something", dateExpression: "next Thursday-ish" }, context(now)),
    ).rejects.toThrow(DateExpressionError);
  });

  it("stores an optional durationMinutes", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z");
    const result = await addEvent(
      testDb.database,
      { title: "Standup", dateExpression: "tomorrow 09:00", durationMinutes: 15 },
      context(now),
    );
    expect(result.durationMinutes).toBe(15);
  });

  describe("addEventInputSchema", () => {
    it("rejects an empty title", () => {
      expect(
        addEventInputSchema.safeParse({ title: "", dateExpression: "today" }).success,
      ).toBe(false);
    });

    it("rejects a title over 200 characters", () => {
      expect(
        addEventInputSchema.safeParse({ title: "x".repeat(201), dateExpression: "today" }).success,
      ).toBe(false);
    });

    it("rejects a non-positive durationMinutes", () => {
      expect(
        addEventInputSchema.safeParse({
          title: "x",
          dateExpression: "today",
          durationMinutes: 0,
        }).success,
      ).toBe(false);
    });

    it("accepts valid input with an optional durationMinutes omitted", () => {
      expect(
        addEventInputSchema.safeParse({ title: "x", dateExpression: "today" }).success,
      ).toBe(true);
    });
  });
});
