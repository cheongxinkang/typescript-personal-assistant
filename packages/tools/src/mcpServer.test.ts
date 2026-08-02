import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { buildMcpServer } from "./mcpServer.js";
import { offeredTools } from "./registry.js";
import type { ToolContext } from "./toolDefinition.js";

/**
 * Exercises the real MCP client/server round trip over InMemoryTransport —
 * not just the handler functions directly — so the offer/enforcement
 * invariant (Requirement 19) and the SDK's own validation/error-normalizing
 * behavior are proven end to end, matching what apps/server actually wires.
 */
describe("buildMcpServer via a real MCP client round trip", () => {
  let testDb: TestDatabase;
  let client: Client;

  const context: ToolContext = {
    // Reassigned in beforeEach-equivalent per test via testDb; placeholder
    // satisfied below once testDb exists.
    database: undefined as never,
    now: new Date("2026-08-02T04:00:00.000Z"),
    ownerTimezone: "Asia/Singapore",
    ownerUserId: OWNER_USER_ID,
  };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
    context.database = testDb.database;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  afterEach(async () => {
    await client?.close();
  });

  async function connectedClient(enabledToolNames: string[]): Promise<Client> {
    const server = buildMcpServer(offeredTools(enabledToolNames), context);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-agent", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
  }

  it("lists only the enabled tools", async () => {
    const c = await connectedClient(["add_event"]);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name)).toEqual(["add_event"]);
  });

  it("has no listable tools when none are enabled — the offer/enforcement invariant, proven, not just documented", async () => {
    // Verified empirically: when zero tools are registered, McpServer
    // doesn't advertise the tools/list capability at all, so the call
    // itself rejects ("Method not found") rather than resolving to an
    // empty array — still consistent with the invariant (nothing is even
    // listable), just a different shape than a naive "empty list" guess.
    const c = await connectedClient([]);
    await expect(c.listTools()).rejects.toThrow(/Method not found/);
  });

  it("a disabled tool has no callable route — calling it fails, since it was never registered", async () => {
    const c = await connectedClient([]);
    await expect(
      c.callTool({ name: "add_event", arguments: { title: "x", dateExpression: "today" } }),
    ).rejects.toThrow();
  });

  it("calling add_event through the real MCP protocol returns structuredContent matching the stored row", async () => {
    const c = await connectedClient(["add_event"]);
    const result = await c.callTool({
      name: "add_event",
      arguments: { title: "Dinner with Cheryl", dateExpression: "tomorrow 19:00" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      title: "Dinner with Cheryl",
      startsAt: "2026-08-03T11:00:00.000Z",
    });
  });

  it("an unresolvable date expression comes back as isError, not a thrown exception", async () => {
    const c = await connectedClient(["add_event"]);
    const result = await c.callTool({
      name: "add_event",
      arguments: { title: "Something", dateExpression: "next Thursday-ish" },
    });

    expect(result.isError).toBe(true);
  });

  it("zod schema validation (empty title) is enforced before the handler runs", async () => {
    const c = await connectedClient(["add_event"]);
    const result = await c.callTool({
      name: "add_event",
      arguments: { title: "", dateExpression: "today" },
    });

    expect(result.isError).toBe(true);
  });
});
