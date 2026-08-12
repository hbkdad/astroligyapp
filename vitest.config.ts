import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: [
      "tests/database.integration.test.ts",
      "**/node_modules/**",
      "**/.git/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/application/**/*.ts",
        "src/domain/**/*.ts",
        "src/presentation/**/*.ts",
        "src/components/**/*.tsx",
        "src/security/**/*.ts",
      ],
    },
  },
});
