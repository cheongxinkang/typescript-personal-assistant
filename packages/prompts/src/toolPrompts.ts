import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { PromptError } from "./loader.js";

const ToolPromptSchema = z.object({
  description: z.string().min(1),
  fields: z.record(z.string().min(1)),
});

const ToolsPromptsSchema = z.record(ToolPromptSchema);

type ToolPrompt = z.infer<typeof ToolPromptSchema>;

const TOOLS_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../prompts/tools.yaml",
);

let cached: Record<string, ToolPrompt> | undefined;

function loadAll(): Record<string, ToolPrompt> {
  if (cached) {
    return cached;
  }

  let raw: unknown;
  try {
    raw = parse(readFileSync(TOOLS_FILE, "utf8"));
  } catch (error) {
    throw new PromptError(
      `Failed to read or parse ${TOOLS_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = ToolsPromptsSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ");
    throw new PromptError(`Invalid tools prompts file ${TOOLS_FILE}: ${fields}`);
  }

  cached = result.data;
  return cached;
}

/** Fails fast (PromptError) if `toolName` has no entry — never a silent undefined. */
export function loadToolPrompt(toolName: string): ToolPrompt {
  const all = loadAll();
  const entry = all[toolName];
  if (!entry) {
    throw new PromptError(`No prompt entry for tool "${toolName}" in ${TOOLS_FILE}`);
  }
  return entry;
}

/**
 * `fields` is a free-form record (any tool can name any fields), so a
 * missing key passes schema validation but would still be a real authoring
 * bug — fail fast naming it, rather than silently describing a field with
 * an empty string.
 */
export function requireToolField(prompt: ToolPrompt, toolName: string, fieldName: string): string {
  const value = prompt.fields[fieldName];
  if (!value) {
    throw new PromptError(
      `Tool "${toolName}" prompt is missing required field "${fieldName}" in ${TOOLS_FILE}`,
    );
  }
  return value;
}
