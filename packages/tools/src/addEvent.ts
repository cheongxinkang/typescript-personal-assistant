import { EVENT_CREATED_KIND, type EventCreatedData } from "@assistant/core";
import { addEvent, addEventInputSchema, type AddEventInput } from "@assistant/domain";
import { loadToolPrompt, requireToolField } from "@assistant/prompts";
import type { ToolDefinition } from "./toolDefinition.js";

const prompt = loadToolPrompt("add_event");

export type { AddEventInput };

/**
 * Phase 2 Stage 1: the validation logic itself now lives in
 * @assistant/domain's addEventInputSchema (Requirement 3 — one schema, one
 * source of truth for what's valid). This layer only adds the model-facing
 * `.describe()` text, which is prompt data and therefore belongs here, not
 * in the transport-agnostic domain package.
 */
export const addEventInputShape = {
  title: addEventInputSchema.shape.title.describe(requireToolField(prompt, "add_event", "title")),
  dateExpression: addEventInputSchema.shape.dateExpression.describe(
    requireToolField(prompt, "add_event", "dateExpression"),
  ),
  durationMinutes: addEventInputSchema.shape.durationMinutes.describe(
    requireToolField(prompt, "add_event", "durationMinutes"),
  ),
};

export const addEventTool: ToolDefinition<AddEventInput, EventCreatedData> = {
  name: "add_event",
  description: prompt.description,
  inputShape: addEventInputShape,
  kind: EVENT_CREATED_KIND,
  // A thin adapter — every rule (date resolution, record construction,
  // "return the row read back after insert") lives in the domain function.
  // This is what Requirement 4's contract test proves: calling this handler
  // and calling addEvent() directly must be indistinguishable.
  handler: (input, context) =>
    addEvent(context.database, input, {
      now: context.now,
      ownerTimezone: context.ownerTimezone,
      ownerUserId: context.ownerUserId,
    }),
};
