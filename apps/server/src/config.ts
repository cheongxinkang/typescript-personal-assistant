import { z } from "zod";

/**
 * Requirement 1: a missing or malformed value fails startup with a message
 * naming the variable — never its value, even in the error.
 */
export class ConfigError extends Error {
  constructor(missingOrInvalid: string[]) {
    super(`Invalid configuration: missing or invalid ${missingOrInvalid.join(", ")}`);
    this.name = "ConfigError";
  }
}

const RawConfigSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CHANNEL_ID: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  OWNER_TIMEZONE: z.string().min(1),
  PORT: z.string().optional(),
});

export interface AppConfig {
  discordBotToken: string;
  discordChannelId: string;
  anthropicApiKey: string;
  databaseUrl: string;
  ownerTimezone: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = RawConfigSchema.safeParse(env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new ConfigError(fields);
  }

  const raw = result.data;
  return {
    discordBotToken: raw.DISCORD_BOT_TOKEN,
    discordChannelId: raw.DISCORD_CHANNEL_ID,
    anthropicApiKey: raw.ANTHROPIC_API_KEY,
    databaseUrl: raw.DATABASE_URL,
    ownerTimezone: raw.OWNER_TIMEZONE,
    port: raw.PORT ? Number(raw.PORT) : 3000,
  };
}
