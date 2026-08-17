import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pino from "pino";
import {
  ensureOwnerUser,
  findOrCreateSession,
  insertEventRow,
  insertProjectRow,
  insertTaskRow,
  insertTurnUsage,
  insertUserMessage,
  OWNER_USER_ID,
} from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";
import { buildViewerApp } from "./viewer.js";

function authHeader(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

describe("buildViewerApp", () => {
  let testDb: TestDatabase;
  let sessionId: string;
  let app: ReturnType<typeof buildViewerApp> | undefined;
  const AUTH = authHeader("owner", "s3cret");

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: "viewer-test-channel",
    });
    sessionId = session.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  function build() {
    app = buildViewerApp({
      logger: pino({ level: "silent" }),
      basicAuthUser: "owner",
      basicAuthPassword: "s3cret",
      database: testDb.database,
      ownerUserId: OWNER_USER_ID,
      sessionId,
    });
    return app;
  }

  it("serves /db as HTML when authenticated", async () => {
    const instance = build();
    await instance.ready();
    const response = await instance.inject({ method: "GET", url: "/db", headers: { authorization: AUTH } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<html");
  });

  it("returns 401 for /db with no credentials", async () => {
    const instance = build();
    await instance.ready();
    const response = await instance.inject({ method: "GET", url: "/db" });
    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toContain("Basic");
  });

  it("has no other routes on this listener — /health is unreachable here", async () => {
    const instance = build();
    await instance.ready();
    const response = await instance.inject({ method: "GET", url: "/health", headers: { authorization: AUTH } });
    expect(response.statusCode).toBe(404);
  });

  it("/api/projects returns exactly the spec'd fields, nothing more", async () => {
    const projectId = randomUUID();
    await insertProjectRow(testDb.database, {
      projectId,
      userId: OWNER_USER_ID,
      title: "Rewrite the personal site",
      description: "should not leak",
    });

    const instance = build();
    await instance.ready();
    const response = await instance.inject({ method: "GET", url: "/api/projects", headers: { authorization: AUTH } });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>[];
    const row = body.find((r) => r.projectId === projectId);
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual(
      ["projectId", "title", "status", "taskGenerationStatus", "targetDate", "createdAt"].sort(),
    );
    expect(row!.title).toBe("Rewrite the personal site");
  });

  it("/api/tasks returns exactly the spec'd fields, nothing more, and includes non-open statuses", async () => {
    const taskId = randomUUID();
    await insertTaskRow(testDb.database, {
      taskId,
      userId: OWNER_USER_ID,
      title: "A cancelled task",
      status: "cancelled",
      description: "should not leak",
    });

    const instance = build();
    await instance.ready();
    const response = await instance.inject({ method: "GET", url: "/api/tasks", headers: { authorization: AUTH } });
    const body = JSON.parse(response.body) as Record<string, unknown>[];
    const row = body.find((r) => r.taskId === taskId);
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual(
      ["taskId", "title", "status", "deadline", "estimatedMinutes", "projectId", "createdAt"].sort(),
    );
    expect(row!.status).toBe("cancelled");
  });

  it("/api/events returns exactly the spec'd fields, including cancelled events", async () => {
    const eventId = randomUUID();
    await insertEventRow(testDb.database, {
      eventId,
      userId: OWNER_USER_ID,
      title: "Cancelled meeting",
      startsAt: new Date("2026-09-01T10:00:00.000Z"),
      durationMinutes: 30,
      status: "cancelled",
    });

    const instance = build();
    await instance.ready();
    const response = await instance.inject({ method: "GET", url: "/api/events", headers: { authorization: AUTH } });
    const body = JSON.parse(response.body) as Record<string, unknown>[];
    const row = body.find((r) => r.eventId === eventId);
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual(
      ["eventId", "title", "startsAt", "durationMinutes", "status", "taskId", "createdAt"].sort(),
    );
  });

  it("/api/messages returns the default window, chronologically, with exactly the spec'd fields", async () => {
    const uniqueChannel = `viewer-messages-${randomUUID()}`;
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: uniqueChannel,
    });
    for (let i = 0; i < 3; i += 1) {
      await insertUserMessage(testDb.database, {
        sessionId: session.id,
        content: `message ${i}`,
        platformMessageId: `viewer-msg-${uniqueChannel}-${i}`,
      });
    }

    const instance = buildViewerApp({
      logger: pino({ level: "silent" }),
      basicAuthUser: "owner",
      basicAuthPassword: "s3cret",
      database: testDb.database,
      ownerUserId: OWNER_USER_ID,
      sessionId: session.id,
    });
    app = instance;
    await instance.ready();
    const response = await instance.inject({ method: "GET", url: "/api/messages", headers: { authorization: AUTH } });
    const body = JSON.parse(response.body) as Record<string, unknown>[];
    expect(body.map((m) => m.content)).toEqual(["message 0", "message 1", "message 2"]);
    expect(Object.keys(body[0]!).sort()).toEqual(
      ["sessionId", "role", "content", "platformMessageId", "createdAt"].sort(),
    );
  });

  it("/api/messages respects ?limit= and clamps it per the spec's edge cases", async () => {
    const uniqueChannel = `viewer-limit-${randomUUID()}`;
    const session = await findOrCreateSession(testDb.database, {
      userId: OWNER_USER_ID,
      channelType: "discord",
      channelId: uniqueChannel,
    });
    for (let i = 0; i < 5; i += 1) {
      await insertUserMessage(testDb.database, {
        sessionId: session.id,
        content: `m${i}`,
        platformMessageId: `limit-${uniqueChannel}-${i}`,
      });
    }

    const instance = buildViewerApp({
      logger: pino({ level: "silent" }),
      basicAuthUser: "owner",
      basicAuthPassword: "s3cret",
      database: testDb.database,
      ownerUserId: OWNER_USER_ID,
      sessionId: session.id,
    });
    app = instance;
    await instance.ready();

    const limited = await instance.inject({
      method: "GET",
      url: "/api/messages?limit=2",
      headers: { authorization: AUTH },
    });
    expect((JSON.parse(limited.body) as unknown[]).length).toBe(2);

    // Zero resets to the default (100) rather than passing through to the query.
    const zero = await instance.inject({
      method: "GET",
      url: "/api/messages?limit=0",
      headers: { authorization: AUTH },
    });
    expect((JSON.parse(zero.body) as unknown[]).length).toBe(5);

    const nonNumeric = await instance.inject({
      method: "GET",
      url: "/api/messages?limit=abc",
      headers: { authorization: AUTH },
    });
    expect((JSON.parse(nonNumeric.body) as unknown[]).length).toBe(5);
  });

  it("/api/turn-usage returns exactly the spec'd fields, with null token counts for a failed turn", async () => {
    await insertTurnUsage(testDb.database, {
      sessionId,
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: null,
      outputTokens: null,
      latencyMs: 42,
      outcome: "failure",
    });

    const instance = build();
    await instance.ready();
    const response = await instance.inject({ method: "GET", url: "/api/turn-usage", headers: { authorization: AUTH } });
    const body = JSON.parse(response.body) as Record<string, unknown>[];
    expect(body.length).toBeGreaterThan(0);
    expect(Object.keys(body[0]!).sort()).toEqual(
      [
        "sessionId",
        "provider",
        "model",
        "inputTokens",
        "outputTokens",
        "cacheReadTokens",
        "latencyMs",
        "outcome",
        "toolCalls",
        "createdAt",
      ].sort(),
    );
    const failedRow = body.find((r) => r.outcome === "failure");
    expect(failedRow?.inputTokens).toBeNull();
    expect(failedRow?.outputTokens).toBeNull();
  });

  it("every /api/* route requires authentication before any query runs", async () => {
    const instance = build();
    await instance.ready();
    for (const url of ["/api/projects", "/api/tasks", "/api/events", "/api/messages", "/api/turn-usage"]) {
      const response = await instance.inject({ method: "GET", url });
      expect(response.statusCode).toBe(401);
    }
  });
});
