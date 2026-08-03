import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ensureOwnerUser, getCurrentEvent, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { addEvent } from "@assistant/domain";
import { buildMcpServer } from "./mcpServer.js";
import { addEventTool } from "./addEvent.js";
import type { ToolContext } from "./toolDefinition.js";

/**
 * Requirement 4 (phase-2-tools.md): baseline 1 — "one implementation per
 * operation" — is proven here, not by inspection. This invokes add_event
 * once directly against @assistant/domain and once through the real MCP
 * tool surface (the same buildMcpServer production code uses), with
 * equivalent input, and asserts the database ends up holding equivalent
 * rows and both calls return equivalent JSON. If packages/tools/addEvent.ts
 * ever reimplements logic instead of delegating to the domain function,
 * this is the test that would catch it.
 *
 * `eventId` is server-generated per insert (Requirement 25/6 of Phase 1),
 * so "identical" here means identical on every field the caller controls
 * or that's derived from it — not the same row, which no two inserts ever
 * produce by design.
 */
describe("add_event: domain function vs MCP tool surface", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("produces equivalent DB rows and JSON via both call paths", async () => {
    const now = new Date("2026-08-02T04:00:00.000Z"); // Sunday, 12:00 SGT
    const input = { title: "Dinner with Cheryl", dateExpression: "tomorrow 19:00" };
    const context: ToolContext = {
      database: testDb.database,
      now,
      ownerTimezone: "Asia/Singapore",
      ownerUserId: OWNER_USER_ID,
    };

    const direct = await addEvent(testDb.database, input, {
      now,
      ownerTimezone: "Asia/Singapore",
      ownerUserId: OWNER_USER_ID,
    });

    const server = buildMcpServer([addEventTool], context);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "contract-test", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const response = await client.callTool({ name: "add_event", arguments: input });
    const viaTool = response.structuredContent as typeof direct;

    // JSON equivalence: same fields, modulo the server-generated eventId.
    expect(viaTool.title).toBe(direct.title);
    expect(viaTool.startsAt).toBe(direct.startsAt);
    expect(viaTool.durationMinutes).toBe(direct.durationMinutes);
    expect(viaTool.eventId).not.toBe(direct.eventId);

    // Database-state equivalence: both rows exist, both readable through the
    // same fold view, both carrying the fields the input specified.
    const directRow = await getCurrentEvent(testDb.database, direct.eventId);
    const viaToolRow = await getCurrentEvent(testDb.database, viaTool.eventId);

    expect(directRow).toBeDefined();
    expect(viaToolRow).toBeDefined();
    expect(directRow?.title).toBe(viaToolRow?.title);
    expect(directRow?.startsAt).toEqual(viaToolRow?.startsAt);
    expect(directRow?.userId).toBe(viaToolRow?.userId);

    await client.close();
    await server.close();
  });
});
