import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output (gitignored). A run that retries/fails a lot can
    // balloon this into tens of thousands of artifact subfolders — once one
    // hit APFS's link-count ceiling here, ESLint's glob walk hung on it for
    // nearly an hour with near-zero CPU. Keep it out of the walk entirely.
    "test-results/**",
  ]),
]);

export default eslintConfig;
