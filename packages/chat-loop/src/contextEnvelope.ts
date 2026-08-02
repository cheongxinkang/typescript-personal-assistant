import { formatIsoWithZone } from "@assistant/core";

/**
 * Requirement 9(b)/10: the current instant goes in the turn's outgoing
 * user-message envelope, never the system prompt — a system prompt that
 * changes every turn can't be a stable, cacheable prefix. This wrapping is
 * ephemeral: it's applied only to what's sent to the provider, never to
 * what's stored in the messages table (see runTurn.ts).
 */
export function buildUserMessageEnvelope(now: Date, timezone: string, userText: string): string {
  return `[Current time: ${formatIsoWithZone(now, timezone)} (${timezone})]\n\n${userText}`;
}
