import { addEventTool } from "./addEvent.js";
import type { ToolDefinition } from "./toolDefinition.js";

export const ALL_TOOLS: readonly ToolDefinition[] = [addEventTool];

/**
 * Requirement 19: the same predicate builds the offer list and gates
 * execution — see mcpServer.ts's buildMcpServer, which only ever registers
 * (and can therefore only ever execute) what this returns. There is no
 * separate enforcement check elsewhere that could drift out of sync with
 * what's offered; an unregistered tool has no callable route to begin
 * with, which is stronger than a runtime check that could have a bug.
 */
export function offeredTools(enabledToolNames: readonly string[]): ToolDefinition[] {
  return ALL_TOOLS.filter((tool) => enabledToolNames.includes(tool.name));
}
