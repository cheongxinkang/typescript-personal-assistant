import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

/** A minimal in-process MCP server exposing one tool, for testing runAgentTurn in isolation. */
export async function buildTestMcpClient(
  behavior: (input: Record<string, unknown>) => {
    structuredContent?: unknown;
    isError?: boolean;
    errorText?: string;
  },
): Promise<Client> {
  const server = new McpServer({ name: "test-tools", version: "0.0.0" });

  server.registerTool(
    "add_event",
    { description: "Test tool.", inputSchema: { title: z.string(), dateExpression: z.string() } },
    async (input) => {
      const outcome = behavior(input);
      if (outcome.isError) {
        return { content: [{ type: "text", text: outcome.errorText ?? "error" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(outcome.structuredContent) }],
        structuredContent: outcome.structuredContent as Record<string, unknown>,
      };
    },
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

export const TEST_TOOL_DEFINITION = {
  name: "add_event",
  description: "Test tool.",
  inputSchema: {
    type: "object" as const,
    properties: { title: { type: "string" }, dateExpression: { type: "string" } },
    required: ["title", "dateExpression"],
  },
};
