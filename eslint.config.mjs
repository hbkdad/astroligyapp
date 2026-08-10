import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "coverage/**",
    "out/**",
    "build/**",
    "codex-scaffold-temp/**",
    "next-env.d.ts",
  ]),
]);
