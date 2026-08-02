/**
 * The channel adapter contract. Lives in packages/core (not
 * packages/channels) so that packages/chat-loop depends only on this
 * interface and never on packages/channels or discord.js — see
 * phase-1-vertical-slice.md Requirement 3 and the
 * chat-loop-does-not-depend-on-channels dependency-cruiser rule.
 */
export interface InboundMessage {
  authorId: string;
  channelId: string;
  content: string;
  /** Platform-native message id, used for delivery idempotency (Requirement 5). */
  platformMessageId: string;
  /** True for messages authored by any bot, including this one. */
  isBot: boolean;
}

/**
 * A handle for replying to one inbound message. `update` and `fail` exist
 * from Stage 1 even though Phase 1 defaults to send-once (see
 * phase-1-implementation-plan.md) — send-once calls only `send`.
 */
export interface ReplyHandle {
  send(text: string): Promise<void>;
  update(text: string): Promise<void>;
  fail(text: string): Promise<void>;
}

export type MessageHandler = (message: InboundMessage, reply: ReplyHandle) => Promise<void>;

export interface ChannelAdapter {
  start(onMessage: MessageHandler): Promise<void>;
  stop(): Promise<void>;
}
