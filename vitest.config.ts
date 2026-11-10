import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "_backup_pre_redesign/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Next's `server-only` package throws outside a React Server Component
      // bundle. Tests exercise server modules directly, so stub the guard.
      "server-only": path.resolve(__dirname, "tests", "stubs", "server-only.ts"),
    },
  },
});
