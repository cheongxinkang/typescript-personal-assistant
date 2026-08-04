import { readFileSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import type { Logger } from "pino";
import { requireBasicAuth } from "./basicAuth.js";

/**
 * Resolved relative to `process.cwd()` — repo root locally, `/app` in the
 * container, matching `dayShape.ts`'s existing convention (see
 * `Dockerfile`'s `COPY viewer ./viewer`).
 */
const DEFAULT_PAGE_PATH = "viewer/db.html";

export interface ViewerAppOptions {
  logger: Logger;
  basicAuthUser: string;
  basicAuthPassword: string;
  pagePath?: string;
}

/**
 * phase_2a-db-visibility.md Requirement 12 (decision 11) — a listener
 * entirely separate from the main app's, carrying *only* the viewer's
 * routes. This is what makes the exposed surface bounded by construction:
 * `/health` and everything else the main app serves is structurally
 * unreachable through this instance, not merely unauthenticated-but-present.
 *
 * The page is read once at boot and cached in memory — "no build step"
 * (Core constraint 3) extends to "no per-request file I/O" for a single
 * static file that never changes without a redeploy.
 */
export function buildViewerApp(options: ViewerAppOptions) {
  const pageHtml = readFileSync(path.resolve(options.pagePath ?? DEFAULT_PAGE_PATH), "utf8");

  const app = Fastify({ loggerInstance: options.logger });

  app.addHook("onRequest", requireBasicAuth(options.basicAuthUser, options.basicAuthPassword));

  app.get("/db", async (_request, reply) => {
    await reply.type("text/html").send(pageHtml);
  });

  return app;
}
