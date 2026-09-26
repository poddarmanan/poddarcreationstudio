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
    // The rendered static preview is a copy of the build output, not source.
    "demo-site/**",
    // Vendored Draco decoder from three.js, served as-is for glTF garment models.
    "public/draco/**",
  ]),
]);

export default eslintConfig;
