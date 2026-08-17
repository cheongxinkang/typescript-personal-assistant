import { afterEach, describe, expect, it } from "vitest";
import pino from "pino";
import {
  cellText,
  emptyStateLabel,
  ERROR_STATE_LABEL,
  formatDateTime,
  projectTitleFor,
} from "../../../viewer/render.mjs";
import { buildViewerApp } from "./viewer.js";
import { ensureOwnerUser, OWNER_USER_ID } from "@assistant/db";
import { startTestDatabase, type TestDatabase } from "@assistant/db/testing";

describe("viewer/render.mjs — pure page logic, no DOM", () => {
  it("cellText renders null/undefined/empty as blank, never the strings 'null'/'undefined'", () => {
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
    expect(cellText("")).toBe("");
    expect(cellText(0)).toBe("0");
    expect(cellText("hi")).toBe("hi");
  });

  it("formatDateTime returns blank for null/invalid, a formatted string otherwise", () => {
    expect(formatDateTime(null)).toBe("");
    expect(formatDateTime(undefined)).toBe("");
    expect(formatDateTime("not a date")).toBe("");
    expect(formatDateTime("2026-08-04T10:00:00.000Z")).not.toBe("");
  });

  it("emptyStateLabel and the error label match the spec's exact wording", () => {
    expect(emptyStateLabel("projects")).toBe("No projects yet.");
    expect(emptyStateLabel("messages")).toBe("No messages yet.");
    expect(ERROR_STATE_LABEL).toBe("Couldn't load this — try reloading the page.");
  });

  it("projectTitleFor returns blank for a task with no projectId", () => {
    const task = { projectId: null };
    expect(projectTitleFor(task, [{ projectId: "p1", title: "A" }])).toBe("");
  });

  it("projectTitleFor resolves a valid projectId to the project's title", () => {
    const task = { projectId: "p1" };
    const projects = [
      { projectId: "p1", title: "Rewrite the personal site" },
      { projectId: "p2", title: "Other" },
    ];
    expect(projectTitleFor(task, projects)).toBe("Rewrite the personal site");
  });

  it("projectTitleFor returns blank for a dangling projectId — never throws", () => {
    const task = { projectId: "does-not-exist" };
    expect(() => projectTitleFor(task, [{ projectId: "p1", title: "A" }])).not.toThrow();
    expect(projectTitleFor(task, [{ projectId: "p1", title: "A" }])).toBe("");
  });

  it("projectTitleFor handles an empty projects list without throwing", () => {
    expect(projectTitleFor({ projectId: "p1" }, [])).toBe("");
  });
});

describe("viewer serves its own render.mjs", () => {
  let testDb: TestDatabase;
  let app: ReturnType<typeof buildViewerApp> | undefined;

  afterEach(async () => {
    await app?.close();
    await testDb?.teardown();
    app = undefined;
  });

  it("GET /render.mjs returns the exact same module the page imports, as JS", async () => {
    testDb = await startTestDatabase();
    await ensureOwnerUser(testDb.database, "Asia/Singapore");

    app = buildViewerApp({
      logger: pino({ level: "silent" }),
      basicAuthUser: "owner",
      basicAuthPassword: "s3cret",
      database: testDb.database,
      ownerUserId: OWNER_USER_ID,
      sessionId: "00000000-0000-0000-0000-000000000000",
    });
    await app.ready();

    const auth = `Basic ${Buffer.from("owner:s3cret").toString("base64")}`;
    const response = await app.inject({ method: "GET", url: "/render.mjs", headers: { authorization: auth } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("javascript");
    expect(response.body).toContain("export function projectTitleFor");
  }, 60_000);
});
