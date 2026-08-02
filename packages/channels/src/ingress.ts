import type { InboundMessage } from "@assistant/core";

/**
 * Requirement 4: process a message only if its channel matches the
 * configured one and its author is not a bot (including this bot itself).
 * Pure and platform-agnostic so it's testable with a synthetic message —
 * no discord.js needed.
 */
export function shouldProcess(message: InboundMessage, configuredChannelId: string): boolean {
  return message.channelId === configuredChannelId && !message.isBot;
}

/**
 * Requirement 5: a platform message id already processed is a no-op —
 * Discord redelivers on gateway reconnect. In-memory for Stage 1; superseded
 * by the messages table's platform_message_id uniqueness constraint once
 * Stage 2 lands (a restart currently forgets what it has seen).
 */
export class InMemoryDeduplicator {
  private readonly seen = new Set<string>();

  hasSeen(platformMessageId: string): boolean {
    return this.seen.has(platformMessageId);
  }

  markSeen(platformMessageId: string): void {
    this.seen.add(platformMessageId);
  }
}
