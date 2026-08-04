# typescript-personal-assistant

Application code for the personal assistant. Specifications, architecture
decisions, and the phased roadmap live in the sibling repository
`agent_home_v1` — see in particular:

- `docs/ARCHITECTURE.md` — living architecture reference
- `docs/architecture-roadmap.md` — phased build plan
- `docs/product-specs/phase-1-vertical-slice.md` — the spec this codebase
  currently implements
- `docs/product-specs/phase-1-implementation-plan.md` — the stage-by-stage
  plan this repo is being built against

See [`capabilities.md`](capabilities.md) in this repo for a one-sentence
summary of every tool the assistant can call.

## Setup

```bash
cp .env.example .env   # fill in real values — see agent_home_v1's setup instructions
pnpm install
pnpm build
pnpm test
pnpm lint
```

Requires Node 22 (see `.nvmrc`) and pnpm 11. Docker Desktop is required from
Stage 2 onward for Testcontainers-backed database tests.

## Workspace layout

```text
apps/server/       # Composition root: ingress, config, embedded MCP server, scheduler
packages/core/      # Shared contracts: response envelope, Clock, ChannelAdapter
packages/channels/  # Platform adapters (Discord)
packages/chat-loop/ # Turn orchestration
packages/agents/    # Router + sub-agents
packages/providers/ # LLM provider abstraction
packages/tools/     # Tool definitions
packages/rendering/ # Envelope → text, per platform
packages/db/        # Drizzle schema, migrations, repositories
packages/prompts/   # Prompt data + loader
```

The dependency rule (`packages/tools`/`packages/db` never import
`packages/agents`/`packages/channels`; `packages/chat-loop` never imports
`packages/channels`) is enforced by `.dependency-cruiser.cjs` and tested in
`tests/dependency-boundaries.test.ts`.
