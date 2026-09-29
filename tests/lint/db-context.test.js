import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ESLint } from "eslint";
import parser from "@typescript-eslint/parser";
import rule from "../../tooling/eslint/db-context.mjs";

const root = mkdtempSync(join(tmpdir(), "db-context-lint-"));
function write(path, content) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}
write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "bundler", baseUrl: ".", paths: { "@/*": ["./*"] } }, include: ["**/*.ts"] }));
write("src/lib/auth/builders/context/ctx.ts", "export class Ctx { readonly #brand = 'ctx'; } export type Alias = Ctx;");
write("app/_/db/helpers.ts", `
import type { Ctx, Alias } from '@/src/lib/auth/builders/context/ctx';
export function good(ctx: Ctx) {}
export const arrow = (ctx: Alias) => {};
export function bad() {}
export function optional(ctx?: Ctx) {}
export function defaulted(ctx: Ctx = null!) {}
export function fake(ctx: { requestId: string }) {}
export function anything(ctx: any) {}
export function nullable(ctx: Ctx | null) {}
export function mixed(ctx: Ctx | string) {}
export function rest(...ctx: Ctx[]) {}
export function overload(ctx: Ctx): void;
export function overload(): void;
export function overload(ctx?: Ctx) {}
export const object = { method() {} };
export const constant = 1;
export type Row = { id: string };
export default bad;
`);
write("app/typeBridge.ts", "export type { bad } from './_/db/helpers';");
write("app/bridge.ts", "export { bad as renamed } from './_/db/helpers';");
const cases = [
  ["valid", "import { good, arrow, constant, type Row } from '@/app/_/db/helpers';", 0],
  ["bad", "import { bad as alias } from '@/app/_/db/helpers';", 1],
  ...["optional", "defaulted", "fake", "anything", "nullable", "mixed", "rest", "overload", "object"].map((name) => [name, `import { ${name} } from '@/app/_/db/helpers';`, 1]),
  ["default", "import helper from '@/app/_/db/helpers';", 1],
  ["type-barrel", "import * as types from '@/app/typeBridge';", 0],
  ["type", "import type { bad, Row } from '@/app/_/db/helpers';", 0],
  ["barrel", "import { renamed } from '@/app/bridge';", 1],
  ["reexport", "export { bad as renamed } from '@/app/_/db/helpers';", 1],
  ["star", "export * from '@/app/_/db/helpers';", 10],
  ["namespace", "import * as helpers from '@/app/_/db/helpers';", 10],
  ["dynamic", "const helpers = await import('@/app/_/db/helpers');", 10],
  ["internal", "import { bad } from './helpers';", 0],
];
const files = cases.map(([name, source, errors]) => ({
  name, errors, path: write(name === "internal" ? "app/_/db/internal.ts" : `app/${name}.ts`, source),
}));
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [{
    files: ["**/*.ts"],
    languageOptions: { parser, parserOptions: { project: join(root, "tsconfig.json"), tsconfigRootDir: root } },
    plugins: { persistence: { rules: { "require-context": rule } } },
    rules: { "persistence/require-context": "error" },
  }],
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
for (const { name, path, errors } of files) {
  test(`DB context boundary: ${name}`, async () => {
    const [result] = await eslint.lintFiles(path);
    expect(result.messages.filter((message) => message.fatal)).toEqual([]);
    expect(result.errorCount).toBe(errors);
    expect(result.messages.every((message) => message.ruleId === "persistence/require-context")).toBe(true);
  });
}
