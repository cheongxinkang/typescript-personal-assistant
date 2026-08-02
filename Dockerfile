# syntax=docker/dockerfile:1
# Multi-stage build, linux/amd64 target (the N95). Built off-box and pushed
# to a registry — the N95 serves, it does not compile. See
# docs/ARCHITECTURE.md §6.

FROM --platform=linux/amd64 node:22-bookworm-slim AS build
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@11.1.2 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/rendering/package.json packages/rendering/package.json
COPY packages/channels/package.json packages/channels/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/prompts/package.json packages/prompts/package.json
COPY packages/tools/package.json packages/tools/package.json
COPY packages/agents/package.json packages/agents/package.json
COPY packages/chat-loop/package.json packages/chat-loop/package.json

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json tsconfig.json ./
COPY apps apps
COPY packages packages

RUN pnpm build

# Prunes the workspace down to apps/server's production dependency closure —
# an N95 should serve, not carry every devDependency in the runtime image.
RUN pnpm --filter @assistant/server deploy --prod /out

FROM --platform=linux/amd64 node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /out/dist ./dist
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json

# Node sizes its heap from host memory, not the cgroup limit — set
# explicitly to ~75% of the container memory limit set in deploy/deployment.yaml
# (256Mi limit -> 192m here). Update both together if the limit changes.
ENV NODE_OPTIONS="--max-old-space-size=192"

EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
