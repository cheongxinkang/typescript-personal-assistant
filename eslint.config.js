// @ts-check
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: false,
        sourceType: "module",
      },
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Everything except the Clock implementation itself and tests must go
    // through the injected Clock, per ARCHITECTURE.md §2's "read once per
    // turn" rule and the risk it exists to catch (Clock skew between
    // context assembly and date resolution within the same turn).
    files: [
      "packages/chat-loop/src/**/*.ts",
      "packages/tools/src/**/*.ts",
      "packages/agents/src/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "Use the injected Clock instead of `new Date()`. See ARCHITECTURE.md §2.",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "Use the injected Clock instead of `Date.now()`. See ARCHITECTURE.md §2.",
        },
      ],
    },
  },
  prettier,
];
