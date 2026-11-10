import { defineConfig } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
  {
    ignores: [".next/**", "node_modules/**", "var/**", "next-env.d.ts", "_backup_pre_redesign/**"],
  },
  ...next,
]);
