import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/** Fails at load time on a missing entry or malformed file — never at the point of use. */
export class PromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptError";
  }
}

const PromptsSchema = z.object({
  assistant_system_prompt: z.string().min(1, "assistant_system_prompt must not be empty"),
});

type Prompts = z.infer<typeof PromptsSchema>;

// Resolves relative to this file, same trick as packages/db/src/migrate.ts —
// works whether running from src/ (vitest) or dist/ (built), since the
// prompts/ directory is a sibling of both.
const PROMPTS_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../prompts/system.yaml",
);

let cached: Prompts | undefined;

function loadAll(): Prompts {
  if (cached) {
    return cached;
  }

  let raw: unknown;
  try {
    raw = parse(readFileSync(PROMPTS_FILE, "utf8"));
  } catch (error) {
    throw new PromptError(
      `Failed to read or parse ${PROMPTS_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = PromptsSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ");
    throw new PromptError(`Invalid prompts file ${PROMPTS_FILE}: ${fields}`);
  }

  cached = result.data;
  return cached;
}

/** The assistant profile's system prompt — static, no per-turn interpolation. */
export function loadAssistantSystemPrompt(): string {
  return loadAll().assistant_system_prompt;
}
