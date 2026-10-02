import { expect, test } from "bun:test";
import IntlMessageFormat from "intl-messageformat";
import { readFileSync } from "node:fs";
import { LOCALES } from "../../src/lib/i18n/locales";
import { messages as en } from "../../src/lib/app/messages/en";
import { messages as pl } from "../../src/lib/app/messages/pl";

/**
 * The catalogs: every locale has exactly the keys English has, no message is
 * empty, and every message is valid ICU for its locale (a plural without the
 * forms Polish needs, an unbalanced brace) fails here rather than in a
 * person's browser. The runtime falls back to English for a missing key;
 * this is what keeps that fallback from ever being needed.
 */

const CATALOG_PAIRS = [
  "src/lib/i18n/messages",
  "src/lib/email/messages",
  "app/(AuthModule)/_/messages",
  "app/(AuthModule)/admin/_/messages",
  "app/(LogsModule)/_/messages",
  "app/(LogsModule)/admin/_/messages",
];

function leaves(tree, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") out.push(...leaves(value, path));
    else out.push([path, value]);
  }
  return out;
}

const catalog = (dir, locale) => JSON.parse(readFileSync(`${dir}/${locale}.json`, "utf8"));

test("the build serves English and Polish", () => {
  expect(LOCALES).toEqual(["en", "pl"]);
});

for (const dir of CATALOG_PAIRS) {
  test(`${dir}: every locale has the English key tree, with no empty message`, () => {
    // A scope with no user-facing strings keeps an empty pair, so the shape is uniform.
    const english = leaves(catalog(dir, "en"));
    for (const locale of LOCALES) {
      const translated = leaves(catalog(dir, locale));
      expect(translated.map(([key]) => key).sort()).toEqual(english.map(([key]) => key).sort());
      for (const [key, value] of translated) {
        expect(typeof value, `${locale}: ${key}`).toBe("string");
        expect(value.trim().length, `${locale}: ${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  test(`${dir}: every message is valid ICU and uses the same arguments in every locale`, () => {
    const english = new Map(leaves(catalog(dir, "en")));
    for (const locale of LOCALES) {
      for (const [key, value] of leaves(catalog(dir, locale))) {
        const format = () => new IntlMessageFormat(value, locale);
        expect(format, `${locale}: ${key}`).not.toThrow();
        const args = Object.keys(format().getAst().length ? collectArgs(format().getAst()) : {}).sort();
        const englishArgs = Object.keys(collectArgs(new IntlMessageFormat(english.get(key), "en").getAst())).sort();
        expect(args, `${locale}: ${key} arguments`).toEqual(englishArgs);
      }
    }
  });
}

/** The argument names an ICU AST refers to, at any depth. */
function collectArgs(ast, out = {}) {
  for (const node of ast) {
    if (typeof node.value === "string" && node.type !== 0 && node.type !== 7) out[node.value] = true;
    if (node.options) for (const option of Object.values(node.options)) collectArgs(option.value, out);
    if (node.children) collectArgs(node.children, out);
  }
  return out;
}

test("the composed catalogs agree with the files", () => {
  const enKeys = leaves(en).map(([key]) => key);
  const plKeys = leaves(pl).map(([key]) => key);
  expect(plKeys.sort()).toEqual(enKeys.sort());
  expect(enKeys.some((key) => key.startsWith("auth."))).toBe(true);
  expect(enKeys.some((key) => key.startsWith("email."))).toBe(true);
});
