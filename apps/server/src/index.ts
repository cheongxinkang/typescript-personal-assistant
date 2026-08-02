import "dotenv/config";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import pino from "pino";
import { CONVERSATIONAL_KIND, FAILURE_KIND, SystemClock } from "@assistant/core";
import { RenderRegistry, renderConversational, renderFailure } from "@assistant/rendering";
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
import { AnthropicProvider } from "@assistant/providers";
import { runTurn } from "@assistant/chat-loop";
import { loadAssistantSystemPrompt } from "@assistant/prompts";
import { ConfigError, loadConfig } from "./config.js";

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
    .register(FAILURE_KIND, renderFailure);

  const provider = new AnthropicProvider(config.anthropicApiKey);
  const systemPrompt = loadAssistantSystemPrompt();
  const clock = new SystemClock();

  // Stage 4: a real chat loop, no tools yet — every message reaches the
  // real model via runTurn, which owns its own history/persistence/usage
  // recording (see packages/chat-loop/src/runTurn.ts).
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

    const { envelope } = await runTurn({
      database,
      provider,
      systemPrompt,
      sessionId: session.id,
      clock,
      ownerTimezone: config.ownerTimezone,
      onError: (error) => {
        turnLogger.error(
          { err: error instanceof Error ? error.message : String(error) },
          "Provider call failed",
        );
      },
    });

    const text = registry.render(envelope, { timezone: config.ownerTimezone });
    await reply.send(text);
    turnLogger.info({ outcome: envelope.status }, "Reply sent");
  });

  const app = Fastify({ loggerInstance: logger });
  // Requirement 2: readiness is a real database check, not just liveness.
  app.get("/health", async (_request, replyContext) => {
    const reachable = await checkDatabaseReachable(database);
    if (!reachable) {
      return replyContext.status(503).send({ status: "unavailable" });
    }
    return { status: "ok" };
  });

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
