import "dotenv/config";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import pino from "pino";
import { CONVERSATIONAL_KIND, type ConversationalEnvelope } from "@assistant/core";
import { RenderRegistry, renderConversational } from "@assistant/rendering";
import { DiscordAdapter } from "@assistant/channels";
import { ConfigError, loadConfig } from "./config.js";

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

  const registry = new RenderRegistry().register(CONVERSATIONAL_KIND, renderConversational);

  // Stage 1 has no chat loop or provider yet — every message gets a
  // hardcoded envelope, rendered through the real registry, to prove the
  // full path (adapter -> ingress filter -> envelope -> renderer -> reply)
  // carries a message end to end before any real logic is layered on.
  const adapter = new DiscordAdapter(
    { botToken: config.discordBotToken, channelId: config.discordChannelId },
    logger,
  );

  await adapter.start(async (message, reply) => {
    const correlationId = randomUUID();
    const turnLogger = logger.child({ correlationId });
    turnLogger.info({ authorId: message.authorId }, "Processing message");

    const envelope: ConversationalEnvelope = {
      status: "success",
      kind: CONVERSATIONAL_KIND,
      data: { text: `Received: "${message.content}" — the pipeline works.` },
    };

    const text = registry.render(envelope, { timezone: config.ownerTimezone });
    await reply.send(text);
    turnLogger.info("Reply sent");
  });

  const app = Fastify({ loggerInstance: logger });
  app.get("/health", async () => ({ status: "ok" }));

  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info({ port: config.port }, "Server listening");
}

main().catch((error) => {
  console.error("Fatal error during startup", error);
  process.exit(1);
});
