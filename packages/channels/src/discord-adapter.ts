import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import type { ChannelAdapter, InboundMessage, MessageHandler, ReplyHandle } from "@assistant/core";
import { InMemoryDeduplicator, shouldProcess } from "./ingress.js";

export interface DiscordAdapterConfig {
  botToken: string;
  channelId: string;
}

export interface DiscordAdapterLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

class DiscordReplyHandle implements ReplyHandle {
  private sentMessage: Message | undefined;

  constructor(private readonly channel: TextBasedChannel) {}

  async send(text: string): Promise<void> {
    if (!("send" in this.channel)) {
      throw new Error("Channel does not support sending messages.");
    }
    this.sentMessage = await this.channel.send(text);
  }

  async update(text: string): Promise<void> {
    if (this.sentMessage) {
      await this.sentMessage.edit(text);
      return;
    }
    await this.send(text);
  }

  async fail(text: string): Promise<void> {
    await this.send(text);
  }
}

/**
 * The one implementation of ChannelAdapter (packages/core) for this phase.
 * Applies the ingress filters (Requirements 4-5) before ever invoking the
 * handler, so no model call or database write happens for a filtered
 * message.
 */
export class DiscordAdapter implements ChannelAdapter {
  private readonly client: Client;
  private readonly deduplicator = new InMemoryDeduplicator();

  constructor(
    private readonly config: DiscordAdapterConfig,
    private readonly logger: DiscordAdapterLogger,
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message],
    });
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.client.on("messageCreate", (discordMessage) => {
      void this.handleMessage(discordMessage, onMessage);
    });

    this.client.once("ready", (readyClient) => {
      this.logger.info({ tag: readyClient.user.tag }, "Discord adapter connected");
    });

    this.client.on("error", (error) => {
      this.logger.error({ err: error.message }, "Discord client error");
    });

    await this.client.login(this.config.botToken);
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  async sendToConfiguredChannel(text: string): Promise<void> {
    const channel = await this.client.channels.fetch(this.config.channelId);
    if (!channel || !("send" in channel)) {
      throw new Error(`Configured channel "${this.config.channelId}" is not a sendable text channel.`);
    }
    await (channel as TextBasedChannel & { send: (text: string) => Promise<Message> }).send(text);
  }

  private async handleMessage(discordMessage: Message, onMessage: MessageHandler): Promise<void> {
    const message: InboundMessage = {
      authorId: discordMessage.author.id,
      channelId: discordMessage.channelId,
      content: discordMessage.content,
      platformMessageId: discordMessage.id,
      isBot: discordMessage.author.bot,
    };

    if (!shouldProcess(message, this.config.channelId)) {
      return;
    }

    if (this.deduplicator.hasSeen(message.platformMessageId)) {
      return;
    }
    this.deduplicator.markSeen(message.platformMessageId);

    const reply = new DiscordReplyHandle(discordMessage.channel);

    try {
      await onMessage(message, reply);
    } catch (error) {
      this.logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        "Unhandled error processing message",
      );
      await reply.fail("Something went wrong handling that message.");
    }
  }
}
