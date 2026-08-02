import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext, ToolDefinition } from "./toolDefinition.js";

/**
 * Embeds the MCP server in-process (docs/ARCHITECTURE.md §2's "dashed
 * edge") — only the tools passed in are ever registered, so authorization
 * holds by construction (see registry.ts). A thrown handler error (e.g.
 * DateExpressionError) is caught by the SDK itself and turned into an
 * isError:true tool result — verified empirically before relying on it;
 * this function does not need its own try/catch around the handler call.
 */
export function buildMcpServer(tools: readonly ToolDefinition[], context: ToolContext): McpServer {
  const server = new McpServer({ name: "assistant-tools", version: "0.0.0" });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputShape },
      async (input) => {
        // Safe by construction: `input` was just validated by the SDK
        // against this exact tool's own inputShape, so it always matches
        // what `tool.handler` expects — but the array-of-heterogeneous-
        // ToolDefinition iteration above erases each tool's own TInput,
        // hence the cast (same pattern as RenderRegistry's storage cast).
        const result = await tool.handler(input as never, context);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result as Record<string, unknown>,
        };
      },
    );
  }

  return server;
}
