import { describe, expect, it } from "vitest";
import type { InboundMessage } from "@assistant/core";
import { InMemoryDeduplicator, shouldProcess } from "./ingress.js";

const CONFIGURED_CHANNEL = "channel-123";

function message(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    authorId: "user-1",
    channelId: CONFIGURED_CHANNEL,
    content: "hello",
    platformMessageId: "msg-1",
    isBot: false,
    ...overrides,
  };
}

describe("shouldProcess", () => {
  it("processes a human message in the configured channel", () => {
    expect(shouldProcess(message(), CONFIGURED_CHANNEL)).toBe(true);
  });

  it("ignores a message in a different channel", () => {
    expect(shouldProcess(message({ channelId: "other-channel" }), CONFIGURED_CHANNEL)).toBe(
      false,
    );
  });

  it("ignores a message from a bot, including this bot itself", () => {
    expect(shouldProcess(message({ isBot: true }), CONFIGURED_CHANNEL)).toBe(false);
  });
});

describe("InMemoryDeduplicator", () => {
  it("has not seen a fresh id", () => {
    const dedup = new InMemoryDeduplicator();
    expect(dedup.hasSeen("msg-1")).toBe(false);
  });

  it("remembers an id once marked seen", () => {
    const dedup = new InMemoryDeduplicator();
    dedup.markSeen("msg-1");
    expect(dedup.hasSeen("msg-1")).toBe(true);
    expect(dedup.hasSeen("msg-2")).toBe(false);
  });
});
