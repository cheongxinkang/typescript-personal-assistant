import type { ZodRawShape } from "zod";
import type { Database } from "@assistant/db";

/**
 * Requirement 9's "the time is already in hand" rule applies to tools too:
 * `now` is the same already-read instant the turn started with, never a
 * Clock a handler could re-read independently.
 */
export interface ToolContext {
  database: Database;
  now: Date;
  ownerTimezone: string;
  ownerUserId: string;
}

/**
 * A tool is a name, a Zod input shape (the same raw-shape form
 * McpServer.registerTool expects — see mcpServer.ts), a description loaded
 * from packages/prompts, and a handler returning typed data. It never
 * returns a formatted string — rendering belongs to packages/rendering,
 * called from packages/chat-loop, never here.
 */
export interface ToolDefinition<TInput = never, TOutput = unknown> {
  name: string;
  description: string;
  inputShape: ZodRawShape;
  handler: (input: TInput, context: ToolContext) => Promise<TOutput>;
  /**
   * The response-envelope `kind` this tool's successful result maps to
   * (Requirement 13). Carried on the tool definition itself, not derived by
   * a per-tool-name switch in packages/chat-loop — that switch was fine for
   * exactly one tool (Phase 1) but stops scaling the moment a second one
   * exists, which Phase 2 does.
   */
  kind: string;
}
