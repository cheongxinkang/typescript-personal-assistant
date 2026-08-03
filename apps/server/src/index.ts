import "dotenv/config";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import pino from "pino";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CONVERSATIONAL_KIND,
  EVENT_CREATED_KIND,
  EVENT_UPDATED_KIND,
  FAILURE_KIND,
  SCHEDULE_KIND,
  SystemClock,
  TASK_ADDED_KIND,
  TASK_UPDATED_KIND,
} from "@assistant/core";
import {
  RenderRegistry,
  renderConversational,
  renderEventCreated,
  renderEventUpdated,
  renderFailure,
  renderSchedule,
  renderTaskAdded,
  renderTaskUpdated,
} from "@assistant/rendering";
import { DiscordAdapter } from "@assistant/channels";
import {
  createDatabase,
  ensureOwnerUser,
  findOrCreateSession,
  insertUserMessage,
  OWNER_USER_ID,
  runMigrations,
  type Database,
} from "@assistant/db";
import { AnthropicProvider, type LLMToolDefinition } from "@assistant/providers";
import { runTurn } from "@assistant/chat-loop";
import { loadAssistantSystemPrompt } from "@assistant/prompts";
import { buildMcpServer, offeredTools, type ToolContext } from "@assistant/tools";
import { ConfigError, loadConfig } from "./config.js";
import { DayShapeConfigError, loadDayShape } from "./dayShape.js";

// No per-profile config yet (Stage 8 adds real multi-user/capability) —
// every tool is enabled for the one owner profile this phase supports.
// Must stay non-empty: an McpServer with zero registered tools doesn't
// advertise the tools/list capability at all, so mcpClient.listTools()
// below would reject rather than resolve to an empty array (verified
// empirically — see packages/tools/src/mcpServer.test.ts). Harden this
// call site if a future profile can legitimately have no tools enabled.
const ENABLED_TOOLS = ["get_schedule", "add_event", "update_event", "add_task", "update_task"];

async function checkDatabaseReachable(database: Database): Promise<boolean> {
  try {
    await database.client`select 1`;
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      logger.fatal({ err: error.message }, "Refusing to start with invalid configuration");
      process.exit(1);
    }
    throw error;
  }

  // Requirement 18/decision 13: the day shape is a checked-in config file,
  // validated the same fail-fast way as env config — a malformed one must
  // never let the process come up half-configured.
  let dayShape;
  try {
    dayShape = loadDayShape();
  } catch (error) {
    if (error instanceof DayShapeConfigError) {
      logger.fatal({ err: error.message }, "Refusing to start with invalid day-shape configuration");
      process.exit(1);
    }
    throw error;
  }

  // Safe to run on every boot — drizzle tracks what's already applied and
  // this is a no-op once the schema is current. The k3s init container
  // (Stage 1's deploy manifests) runs the same thing; both racing to apply
  // is fine since a migration only ever runs once, by drizzle's own bookkeeping.
  await runMigrations(config.databaseUrl);

  const database = createDatabase(config.databaseUrl);
  await ensureOwnerUser(database, config.ownerTimezone);
  const session = await findOrCreateSession(database, {
    userId: OWNER_USER_ID,
    channelType: "discord",
    channelId: config.discordChannelId,
  });

  const registry = new RenderRegistry()
    .register(CONVERSATIONAL_KIND, renderConversational)
    .register(EVENT_CREATED_KIND, renderEventCreated)
    .register(SCHEDULE_KIND, renderSchedule)
    .register(TASK_ADDED_KIND, renderTaskAdded)
    .register(TASK_UPDATED_KIND, renderTaskUpdated)
    .register(EVENT_UPDATED_KIND, renderEventUpdated)
    .register(FAILURE_KIND, renderFailure);

  const provider = new AnthropicProvider(config.anthropicApiKey);
  const systemPrompt = loadAssistantSystemPrompt();
  const clock = new SystemClock();

  const adapter = new DiscordAdapter(
    { botToken: config.discordBotToken, channelId: config.discordChannelId },
    logger,
  );

  await adapter.start(async (message, reply) => {
    const correlationId = randomUUID();
    const turnLogger = logger.child({ correlationId });
    turnLogger.info({ authorId: message.authorId }, "Processing message");

    const inserted = await insertUserMessage(database, {
      sessionId: session.id,
      content: message.content,
      platformMessageId: message.platformMessageId,
    });
    if (!inserted) {
      // Requirement 5: a redelivered platform message id is a no-op —
      // the durable check caught what the adapter's in-memory one might
      // have missed across a restart.
      turnLogger.info("Duplicate platform_message_id, skipping");
      return;
    }

    // Read exactly once for this turn (see packages/core's Clock doc) and
    // thread it into both runTurn and the tool context below — never two
    // separate reads. The MCP server is built fresh per turn, not at boot:
    // its tool handlers close over `toolContext`, and a shared long-lived
    // context would either go stale (built once at boot) or race under two
    // concurrent messages (if mutated in place). A fresh server/client pair
    // costs low-single-digit milliseconds in-process — cheap insurance.
    const now = clock.now();
    const toolContext: ToolContext = {
      database,
      now,
      ownerTimezone: config.ownerTimezone,
      ownerUserId: OWNER_USER_ID,
      dayShape,
    };
    const enabledToolDefinitions = offeredTools(ENABLED_TOOLS);
    // Requirement 13/28: each tool declares which envelope kind its result
    // maps to; runTurn needs this to render without a per-tool-name switch.
    // Built here, not sent over MCP — it's a purely local rendering
    // decision, not part of the protocol's wire shape.
    const toolKinds: Record<string, string> = Object.fromEntries(
      enabledToolDefinitions.map((tool) => [tool.name, tool.kind]),
    );

    const mcpServer = buildMcpServer(enabledToolDefinitions, toolContext);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new McpClient({ name: "assistant-agent", version: "0.0.0" });
    await Promise.all([mcpServer.connect(serverTransport), mcpClient.connect(clientTransport)]);
    const { tools: mcpTools } = await mcpClient.listTools();
    // The MCP protocol allows a tool with no description; ours never do
    // (packages/tools' ToolDefinition.description is required and loaded
    // from prompts.yaml, validated non-empty at load time) — this mapping
    // just narrows the SDK's more permissive type to what we know is true.
    const tools: LLMToolDefinition[] = mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
    }));

    try {
      const { text } = await runTurn({
        database,
        provider,
        systemPrompt,
        sessionId: session.id,
        now,
        ownerTimezone: config.ownerTimezone,
        registry,
        mcpClient,
        tools,
        toolKinds,
        onError: (error) => {
          turnLogger.error(
            { err: error instanceof Error ? error.message : String(error) },
            "Provider call failed",
          );
        },
      });

      await reply.send(text);
      turnLogger.info("Reply sent");
    } finally {
      await mcpClient.close();
      await mcpServer.close();
    }
  });

  const app = Fastify({ loggerInstance: logger });
  // Requirement 2: readiness is a real database check, not just liveness.
  // logLevel: "silent" — the readiness/liveness probes hit this every
  // 10-30s (deploy/deployment.yaml's periodSeconds); logging each one
  // drowns out the handful of log lines per real turn that actually matter.
  app.get(
    "/health",
    { logLevel: "silent" },
    async (_request, replyContext) => {
      const reachable = await checkDatabaseReachable(database);
      if (!reachable) {
        return replyContext.status(503).send({ status: "unavailable" });
      }
      return { status: "ok" };
    },
  );

  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info({ port: config.port }, "Server listening");

  const shutdown = async (): Promise<void> => {
    logger.info("Shutting down");
    await adapter.stop();
    await app.close();
    await database.client.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("Fatal error during startup", error);
  process.exit(1);
});
