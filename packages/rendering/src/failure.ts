import { FAILURE_KIND, type FailureData } from "@assistant/core";
import type { Renderer } from "./registry.js";

/** runTurn's failure envelope renders as its already-generic message, verbatim. */
export const renderFailure: Renderer<FailureData> = (data) => data.message;

export { FAILURE_KIND };
