import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Basisconfiguratie voor ESLint (flat config). Sites breiden dit uit. */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/coverage/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // In tests mag een non-null assertion: een fout daar is een falende test, geen productiefout.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
