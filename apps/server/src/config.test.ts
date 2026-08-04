import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

const VALID_ENV = {
  DISCORD_BOT_TOKEN: "token",
  DISCORD_CHANNEL_ID: "channel-1",
  ANTHROPIC_API_KEY: "sk-ant-test",
  DATABASE_URL: "postgres://localhost/test",
  OWNER_TIMEZONE: "Asia/Singapore",
  BASIC_AUTH_USER: "owner",
  BASIC_AUTH_PASSWORD: "correct-horse-battery-staple",
};

describe("loadConfig", () => {
  it("parses a fully-populated environment", () => {
    const config = loadConfig(VALID_ENV);
    expect(config).toEqual({
      discordBotToken: "token",
      discordChannelId: "channel-1",
      anthropicApiKey: "sk-ant-test",
      databaseUrl: "postgres://localhost/test",
      ownerTimezone: "Asia/Singapore",
      port: 3000,
      basicAuthUser: "owner",
      basicAuthPassword: "correct-horse-battery-staple",
      viewerPort: 8080,
    });
  });

  it("respects an explicit PORT", () => {
    const config = loadConfig({ ...VALID_ENV, PORT: "8080" });
    expect(config.port).toBe(8080);
  });

  it("respects an explicit VIEWER_PORT", () => {
    const config = loadConfig({ ...VALID_ENV, VIEWER_PORT: "9090" });
    expect(config.viewerPort).toBe(9090);
  });

  it("throws ConfigError naming a missing Basic Auth variable", () => {
    const { BASIC_AUTH_PASSWORD: _omit, ...withoutPassword } = VALID_ENV;
    try {
      loadConfig(withoutPassword);
      expect.unreachable("loadConfig should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain("BASIC_AUTH_PASSWORD");
    }
  });

  it("throws ConfigError naming the missing variable, never its value", () => {
    const { DISCORD_BOT_TOKEN: _omit, ...withoutToken } = VALID_ENV;
    try {
      loadConfig(withoutToken);
      expect.unreachable("loadConfig should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain("DISCORD_BOT_TOKEN");
      expect((error as Error).message).not.toContain(VALID_ENV.ANTHROPIC_API_KEY);
    }
  });

  it("names every missing variable when several are absent", () => {
    try {
      loadConfig({});
      expect.unreachable("loadConfig should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("DISCORD_BOT_TOKEN");
      expect(message).toContain("ANTHROPIC_API_KEY");
      expect(message).toContain("DATABASE_URL");
    }
  });
});
