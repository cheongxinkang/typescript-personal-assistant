// Deliberately forbidden: packages/tools must never import packages/agents.
// See docs/ARCHITECTURE.md §1 and .dependency-cruiser.cjs's
// "no-tools-importing-agents-or-channels" rule, which this fixture exists
// to prove catches a violation.
export { AGENT_MARKER } from "../../agents/src/index.js";
