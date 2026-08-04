import { readFileSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import type { Logger } from "pino";
import {
  listAllEventsForOwner,
  listProjectsForOwner,
  listRecentTurnUsage,
  listTasksForOwner,
  loadRecentHistory,
  type Database,
} from "@assistant/db";
import { requireBasicAuth } from "./basicAuth.js";
import {
  parseLimit,
  toEventView,
  toMessageView,
  toProjectView,
  toTaskView,
  toTurnUsageView,
  VIEWER_MAX_LIMIT,
} from "./viewerMappers.js";

/**
 * Resolved relative to `process.cwd()` — repo root locally, `/app` in the
 * container, matching `dayShape.ts`'s existing convention (see
 * `Dockerfile`'s `COPY viewer ./viewer`).
 */
const DEFAULT_PAGE_DIR = "viewer";

export interface ViewerAppOptions {
  logger: Logger;
  basicAuthUser: string;
  basicAuthPassword: string;
  database: Database;
  ownerUserId: string;
  sessionId: string;
  pageDir?: string;
}

/**
 * phase_2a-db-visibility.md Requirement 12 (decision 11) — a listener
 * entirely separate from the main app's, carrying *only* the viewer's
 * routes. This is what makes the exposed surface bounded by construction:
 * `/health` and everything else the main app serves is structurally
 * unreachable through this instance, not merely unauthenticated-but-present.
 *
 * The page and its render module are read once at boot and cached in
 * memory — "no build step" (Core constraint 3) extends to "no per-request
 * file I/O" for static files that never change without a redeploy.
 */
export function buildViewerApp(options: ViewerAppOptions) {
  const pageDir = path.resolve(options.pageDir ?? DEFAULT_PAGE_DIR);
  const pageHtml = readFileSync(path.join(pageDir, "db.html"), "utf8");
  const renderModuleJs = readFileSync(path.join(pageDir, "render.mjs"), "utf8");
  const { database, ownerUserId, sessionId } = options;

  const app = Fastify({ loggerInstance: options.logger });

  app.addHook("onRequest", requireBasicAuth(options.basicAuthUser, options.basicAuthPassword));

  app.get("/db", async (_request, reply) => {
    await reply.type("text/html").send(pageHtml);
  });

  app.get("/render.mjs", async (_request, reply) => {
    await reply.type("text/javascript").send(renderModuleJs);
  });

  // Requirement 7: every query carries a defensive limit, projects/tasks/
  // events included, even though they're otherwise "all rows".
  app.get("/api/projects", async () => {
    const rows = await listProjectsForOwner(database, ownerUserId, VIEWER_MAX_LIMIT);
    return rows.map(toProjectView);
  });

  app.get("/api/tasks", async () => {
    const rows = await listTasksForOwner(database, ownerUserId, undefined, VIEWER_MAX_LIMIT);
    return rows.map(toTaskView);
  });

  app.get("/api/events", async () => {
    const rows = await listAllEventsForOwner(database, ownerUserId, VIEWER_MAX_LIMIT);
    return rows.map(toEventView);
  });

  // Requirement 5: windowed, not all-rows — messages grows without bound.
  app.get<{ Querystring: { limit?: string } }>("/api/messages", async (request) => {
    const limit = parseLimit(request.query.limit);
    const rows = await loadRecentHistory(database, sessionId, limit);
    return rows.map(toMessageView);
  });

  // Requirement 6: windowed identically to /api/messages.
  app.get<{ Querystring: { limit?: string } }>("/api/turn-usage", async (request) => {
    const limit = parseLimit(request.query.limit);
    const rows = await listRecentTurnUsage(database, sessionId, limit);
    return rows.map(toTurnUsageView);
  });

  return app;
}
