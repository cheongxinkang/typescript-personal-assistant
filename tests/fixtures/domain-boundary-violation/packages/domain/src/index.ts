// Deliberately forbidden: packages/domain must never import packages/tools.
// See docs/product-specs/phase-2-tools.md Requirement 2 and
// .dependency-cruiser.cjs's "no-domain-importing-upper-layers" rule, which
// this fixture exists to prove catches a violation.
export { TOOLS_MARKER } from "../../tools/src/index.js";
