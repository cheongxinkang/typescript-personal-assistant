import { afterEach, describe, expect, it } from "vitest";
import pino from "pino";
import { buildViewerApp } from "./viewer.js";

function authHeader(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

describe("buildViewerApp", () => {
  let app: ReturnType<typeof buildViewerApp> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("serves /db as HTML when authenticated", async () => {
    app = buildViewerApp({
      logger: pino({ level: "silent" }),
      basicAuthUser: "owner",
      basicAuthPassword: "s3cret",
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/db",
      headers: { authorization: authHeader("owner", "s3cret") },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<html");
  });

  it("returns 401 for /db with no credentials — Requirement 12's exposed surface still requires auth", async () => {
    app = buildViewerApp({
      logger: pino({ level: "silent" }),
      basicAuthUser: "owner",
      basicAuthPassword: "s3cret",
    });
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/db" });
    expect(response.statusCode).toBe(401);
  });

  it("has no other routes — the viewer listener carries only its own surface", async () => {
    app = buildViewerApp({
      logger: pino({ level: "silent" }),
      basicAuthUser: "owner",
      basicAuthPassword: "s3cret",
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { authorization: authHeader("owner", "s3cret") },
    });
    expect(response.statusCode).toBe(404);
  });
});
