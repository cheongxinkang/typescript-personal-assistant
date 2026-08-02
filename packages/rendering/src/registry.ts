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
    return renderer(envelope.data as never, context);
  }
}
