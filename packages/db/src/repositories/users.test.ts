import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, type TestDatabase } from "../testing.js";
import { ensureOwnerUser, getOwnerTimezone, OWNER_USER_ID } from "./users.js";

describe("ensureOwnerUser", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates the owner user with the fixed id on first call", async () => {
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
    expect(await getOwnerTimezone(testDb.database)).toBe("Asia/Singapore");
  });

  it("is idempotent and updates the timezone on a later call", async () => {
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
    await ensureOwnerUser(testDb.database, "America/New_York");
    expect(await getOwnerTimezone(testDb.database)).toBe("America/New_York");
  });

  it("always addresses the same fixed id", () => {
    expect(OWNER_USER_ID).toBe("00000000-0000-0000-0000-000000000001");
  });
});
