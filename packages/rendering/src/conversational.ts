import { CONVERSATIONAL_KIND, type ConversationalData } from "@assistant/core";
import type { Renderer } from "./registry.js";

/** The one renderer whose text is not template-generated — see Requirement 15. */
export const renderConversational: Renderer<ConversationalData> = (data) => data.text;

export { CONVERSATIONAL_KIND };
