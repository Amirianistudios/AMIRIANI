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
    // Working directories, not source. `.reference-mirror` holds a copy of the
    // reference storefront for the visual comparison — thousands of lines of
    // someone else's minified theme JavaScript, which would otherwise drown
    // this project's own findings in warnings.
    ".reference-mirror/**",
    ".local-storage/**",
    "visual-comparison/**",
  ]),
]);

export default eslintConfig;
