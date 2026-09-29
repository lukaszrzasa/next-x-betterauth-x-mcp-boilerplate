import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import dbContextRule from "./tooling/eslint/db-context.mjs";

/**
 * Feature code reaches the database through a service that takes a `Ctx`,
 * and gets a `Ctx` only from `defineAction`. These restrictions are what make
 * that a rule rather than a suggestion: the `Ctx` brand stops an object literal
 * being passed off as a context, and this stops the far easier bypass of
 * skipping the context altogether and importing the database directly.
 */
const internalOnly = [
  {
    name: "@/src/lib/db",
    message:
      "Database access belongs in an owning service that takes a Ctx. Feature code must go through defineAction.",
  },
  {
    name: "@/src/lib/redis",
    message:
      "Use a helper under src/lib rather than reaching for Redis directly.",
  },
];

/**
 * Imports are either sibling-relative (`./x`) or root-aliased (`@/src/...`,
 * `@/app/...`). A `../` chain encodes the importer's depth, so moving a file
 * breaks its imports and the reader has to count dots to find the target.
 * ESLint replaces rather than merges a rule's options per file, so every
 * `no-restricted-imports` block below includes this pattern.
 */
const noParentImports = {
  group: ["../*"],
  message: "Import siblings with ./ and everything else through the @/ alias.",
};

const contextTypesOnly = {
  group: ["**/builders/context", "**/builders/context/**"],
  allowTypeImports: true,
  message:
    "Import context types only. Runtime contexts are constructed by defineAction.",
};

const PAGE_FACTORY_MODULE = "@/src/lib/app/access";

/**
 * Every page under an `admin` segment is written as
 * `export default page(route, render)` from `@/src/lib/app/access`, so its
 * access rule is the declared route's and cannot be left out. Anything else
 * as the default export is an error.
 */
const adminPageRule = {
  meta: {
    type: "problem",
    docs: { description: "Admin pages must be declared through page()." },
    messages: {
      notFactory:
        "Admin pages must be written as `export default page(route, render)` with `page` imported from " +
        `"${PAGE_FACTORY_MODULE}".`,
    },
    schema: [],
  },
  create(context) {
    let factoryName = null;

    return {
      ImportDeclaration(node) {
        if (node.source.value !== PAGE_FACTORY_MODULE) return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            (specifier.imported.name ?? specifier.imported.value) === "page"
          ) {
            factoryName = specifier.local.name;
          }
        }
      },
      ExportDefaultDeclaration(node) {
        const declaration = node.declaration;
        const isFactoryCall =
          factoryName !== null &&
          declaration.type === "CallExpression" &&
          declaration.callee.type === "Identifier" &&
          declaration.callee.name === factoryName;

        if (!isFactoryCall) {
          context.report({ node, messageId: "notFactory" });
        }
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    files: ["**/*.{ts,tsx,mts}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { persistence: { rules: { "require-context": dbContextRule } } },
    rules: { "persistence/require-context": "error" },
  },

  // A ternary nested in another one reads as a puzzle; use early returns,
  // a lookup object or a small helper instead.
  { rules: { "no-nested-ternary": "error" } },

  {
    files: ["app/**/admin/**/page.{ts,tsx}"],
    plugins: { app: { rules: { "admin-page": adminPageRule } } },
    rules: { "app/admin-page": "error" },
  },

  // Everything the two blocks below do not narrow further.
  {
    files: ["src/lib/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noParentImports] }],
    },
  },

  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["src/lib/**", "app/**/_/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: internalOnly,
          patterns: [
            noParentImports,
            {
              group: [
                "**/lib/db",
                "**/lib/db/*",
                "**/lib/redis",
                "**/lib/redis/*",
              ],
            },
            contextTypesOnly,
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
            noParentImports,
            { group: ["**/lib/redis", "**/lib/redis/*"] },
            contextTypesOnly,
          ],
        },
      ],
    },
  },

  // The auth module's persistence stays persistence: reads, writes and the
  // predicates of a conditional write. What to do, in which order, whom to
  // mail and what to charge is decided by the operation that calls it. The
  // transaction-bound setup and the lock need no exception: they import the
  // provider and the driver, which are not restricted.
  {
    files: ["app/(AuthModule)/**/_/db/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...internalOnly.filter((entry) => entry.name !== "@/src/lib/db"),
            {
              name: "@/src/lib/email",
              message: "Persistence sends no mail; the operation delivers after the write.",
            },
            {
              name: "@/src/lib/throttle",
              message: "Attempt budgets and cooldowns are charged by the operation or its service.",
            },
          ],
          patterns: [
            noParentImports,
            { group: ["**/lib/redis", "**/lib/redis/*"] },
            contextTypesOnly,
            {
              group: ["**/_/operations/**", "**/_/services/**", "**/_/policies/**", "**/_/errors/**", "**/_/errors", "**/_/policy"],
              message:
                "Persistence returns facts (a row, null, changed or not); workflows, policies, effects and refusals belong to the operation.",
            },
          ],
        },
      ],
    },
  },

  // The logs module's persistence, by the same rule. It is handed prepared
  // values: what is redacted, what a record key's replay means and which
  // refusal a caller gets are decided by the operation. Types may cross
  // (a prepared row, a query's vocabulary); the code that decides may not.
  {
    files: ["app/(LogsModule)/**/_/db/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...internalOnly.filter((entry) => entry.name !== "@/src/lib/db"),
            {
              name: "@/src/lib/email",
              message: "Persistence sends no mail; the sender records through the operations.",
            },
          ],
          patterns: [
            noParentImports,
            { group: ["**/lib/redis", "**/lib/redis/*"] },
            contextTypesOnly,
            {
              group: ["**/_/operations/**"],
              message:
                "Persistence returns facts (a row, null, an ID or none); the operation decides what they mean.",
            },
            {
              group: [
                "**/_/redaction",
                "**/_/derivation",
                "**/_/schema",
                "**/_/types",
                "**/_/staffLog/schema",
                "**/_/staffLog/types",
                "**/_/queryState",
              ],
              allowTypeImports: true,
              message:
                "Import types only. Validation, redaction, derived values, range resolution and recorder errors belong to the operation.",
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
