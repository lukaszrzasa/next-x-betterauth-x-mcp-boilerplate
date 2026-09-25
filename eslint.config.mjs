import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Feature code reaches the database through a db-service that takes a `Ctx`,
 * and gets a `Ctx` only from `defineAction`. These restrictions are what make
 * that a rule rather than a suggestion: the `Ctx` brand stops an object literal
 * being passed off as a context, and this stops the far easier bypass of
 * skipping the context altogether and importing the database directly.
 */
const internalOnly = [
  {
    name: "@/src/lib/db",
    message:
      "Database access belongs in an owning db-service that takes a Ctx. Feature code must go through defineAction.",
  },
  {
    name: "@/src/lib/redis",
    message:
      "Use a helper under src/lib rather than reaching for Redis directly.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["src/lib/**", "app/**/_/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: internalOnly,
          patterns: [
            {
              group: [
                "**/lib/db",
                "**/lib/db/*",
                "**/lib/redis",
                "**/lib/redis/*",
              ],
            },
            {
              group: ["**/builders/context", "**/builders/context/**"],
              allowTypeImports: true,
              message:
                "Import context types only. Runtime contexts are constructed by defineAction.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["app/**/_/db/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: internalOnly.filter((entry) => entry.name !== "@/src/lib/db"),
          patterns: [
            { group: ["**/lib/redis", "**/lib/redis/*"] },
            {
              group: ["**/builders/context", "**/builders/context/**"],
              allowTypeImports: true,
              message:
                "Import context types only. Runtime contexts are constructed by defineAction.",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
