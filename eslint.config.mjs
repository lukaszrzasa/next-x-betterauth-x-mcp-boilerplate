import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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

const PAGE_FACTORY_MODULE = "@/app/_/access";

/**
 * Every page under an `admin` segment is written as
 * `export default page(route, render)` from `@/app/_/access`, so its
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
