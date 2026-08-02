import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["{apps,packages,tests}/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["packages/tools/src/**", "packages/db/src/**", "packages/chat-loop/src/**"],
      // apps/server and packages/channels are deliberately excluded from the
      // coverage gate — see docs/product-specs/phase-1-vertical-slice.md's
      // Test plan. They are proven by integration and manual tests instead.
      thresholds: {
        lines: 80,
        statements: 80,
      },
    },
  },
});
