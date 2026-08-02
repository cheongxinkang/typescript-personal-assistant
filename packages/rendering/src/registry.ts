import type { ResponseEnvelope } from "@assistant/core";

/**
 * Pure, deterministic, synchronous — makes no model call. See
 * docs/ARCHITECTURE.md §2 and phase-1-vertical-slice.md Requirement 16.
 */
export type Renderer<TData = unknown> = (data: TData, context: RenderContext) => string;

export interface RenderContext {
  timezone: string;
}

export class UnregisteredRenderKindError extends Error {
  constructor(public readonly kind: string) {
    super(`No renderer registered for kind "${kind}". Register one before startup completes.`);
    this.name = "UnregisteredRenderKindError";
  }
}

// Discord's hard message-length limit. Phase 1 has exactly one channel, so
// this is unconditional for now — parameterize by platform when Stage 8
// adds a second channel with a different limit. Per Requirement 17,
// platform concerns live only here, never in packages/chat-loop.
const DISCORD_MAX_LENGTH = 2000;
const TRUNCATION_MARKER = "\n\n[…truncated]";

function truncateForPlatform(text: string): string {
  if (text.length <= DISCORD_MAX_LENGTH) {
    return text;
  }
  const keep = DISCORD_MAX_LENGTH - TRUNCATION_MARKER.length;
  return text.slice(0, keep) + TRUNCATION_MARKER;
}

/**
 * Requirement 16: an unregistered kind is a startup failure, not a runtime
 * one — `render` throws immediately if the registry lacks an entry, and
 * callers are expected to validate completeness at boot (Requirement 16's
 * exit criterion), not to catch this mid-turn.
 */
export class RenderRegistry {
  private readonly renderers = new Map<string, Renderer<never>>();

  register<TData>(kind: string, renderer: Renderer<TData>): this {
    this.renderers.set(kind, renderer as Renderer<never>);
    return this;
  }

  has(kind: string): boolean {
    return this.renderers.has(kind);
  }

  render(envelope: ResponseEnvelope, context: RenderContext): string {
    const renderer = this.renderers.get(envelope.kind);
    if (!renderer) {
      throw new UnregisteredRenderKindError(envelope.kind);
    }
    // Safe by construction: `register` only ever stores a Renderer<TData>
    // under the kind it was registered for, so the data shape here always
    // matches what was registered — but TypeScript can't see that link
    // through the type-erased Map, hence the cast.
    const text = renderer(envelope.data as never, context);
    return truncateForPlatform(text);
  }
}
