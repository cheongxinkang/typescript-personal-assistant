import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { requireBasicAuth } from "./basicAuth.js";

function authHeader(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

async function buildTestApp() {
  const app = Fastify();
  app.addHook("onRequest", requireBasicAuth("owner", "s3cret"));
  app.get("/probe", async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("requireBasicAuth", () => {
  it("allows a request with the correct credentials", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: authHeader("owner", "s3cret") },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns 401 with WWW-Authenticate when no credentials are given", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/probe" });
    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toContain("Basic");
    await app.close();
  });

  it("returns 401 for a wrong password", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: authHeader("owner", "wrong") },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 for a wrong username", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: authHeader("someone-else", "s3cret") },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 for a malformed authorization header", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer not-basic-auth" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 for credentials of a different length than expected", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: authHeader("owner", "short") },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
