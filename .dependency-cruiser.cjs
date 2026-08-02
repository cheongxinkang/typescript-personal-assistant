/**
 * Enforces the dependency rule in docs/ARCHITECTURE.md §1:
 *   - packages/tools and packages/db never import packages/agents or packages/channels.
 *   - packages/rendering depends only on packages/core (the envelope type) —
 *     never chat-loop, agents, channels, or db.
 * pnpm's strict node_modules layout already blocks most of this by refusing
 * to resolve an undeclared workspace dependency; this catches the rest
 * (relative-path escapes, and anything pnpm's resolution wouldn't).
 */
module.exports = {
  forbidden: [
    {
      name: "no-tools-importing-agents-or-channels",
      severity: "error",
      comment:
        "packages/tools must be callable without booting a chat session — see ARCHITECTURE.md §1.",
      from: { path: "^packages/tools" },
      to: { path: "^packages/(agents|channels)" },
    },
    {
      name: "no-db-importing-agents-or-channels",
      severity: "error",
      comment: "packages/db is a persistence layer, not a session-aware one — see ARCHITECTURE.md §1.",
      from: { path: "^packages/db" },
      to: { path: "^packages/(agents|channels)" },
    },
    {
      name: "rendering-depends-only-on-core",
      severity: "error",
      comment:
        "packages/rendering must be testable by calling it with a literal envelope — see ARCHITECTURE.md §2.",
      from: { path: "^packages/rendering" },
      to: {
        path: "^packages/(chat-loop|agents|channels|db|providers|tools)",
      },
    },
    {
      name: "chat-loop-does-not-depend-on-channels",
      severity: "error",
      comment:
        "The ChannelAdapter/ReplyHandle contracts live in packages/core so chat-loop depends only on the interface, never on packages/channels or discord.js — see phase-1-vertical-slice.md Requirement 3.",
      from: { path: "^packages/chat-loop" },
      to: { path: "^packages/channels" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular workspace dependencies indicate a boundary was crossed in both directions.",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
