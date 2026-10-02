import { expect, test } from "bun:test";
import { negotiateLocale, requestLocale } from "../../src/lib/i18n/resolveLocale";
import { LOCALE_HEADER } from "../../src/lib/i18n/locales";
import { withFallback } from "../../src/lib/i18n/merge";

const headers = (init) => new Headers(init);

test("the browser's language picks a supported locale; anything else is the default", () => {
  expect(negotiateLocale(headers({ "accept-language": "pl-PL,pl;q=0.9,en;q=0.8" }))).toBe("pl");
  expect(negotiateLocale(headers({ "accept-language": "en-GB,en;q=0.9" }))).toBe("en");
  expect(negotiateLocale(headers({ "accept-language": "de-DE,de;q=0.9" }))).toBe("en");
  expect(negotiateLocale(headers({ "accept-language": "de,pl;q=0.5" }))).toBe("pl");
  expect(negotiateLocale(headers({ "accept-language": "*" }))).toBe("en");
  expect(negotiateLocale(headers({ "accept-language": "not a language!!" }))).toBe("en");
  expect(negotiateLocale(headers({}))).toBe("en");
});

test("an explicit cookie wins over the browser; an unknown cookie value is ignored", () => {
  expect(negotiateLocale(headers({ cookie: "locale=pl", "accept-language": "en" }))).toBe("pl");
  expect(negotiateLocale(headers({ cookie: "theme=dark; locale=en", "accept-language": "pl" }))).toBe("en");
  expect(negotiateLocale(headers({ cookie: "locale=fr", "accept-language": "pl" }))).toBe("pl");
});

test("the app trusts the proxy's header and negotiates only when it is absent or invalid", () => {
  expect(requestLocale(headers({ [LOCALE_HEADER]: "pl", "accept-language": "en" }))).toBe("pl");
  expect(requestLocale(headers({ [LOCALE_HEADER]: "xx", "accept-language": "pl" }))).toBe("pl");
  expect(requestLocale(headers({ "accept-language": "pl" }))).toBe("pl");
  expect(requestLocale(headers({}))).toBe("en");
});

test("a translation falls back to English key by key", () => {
  const merged = withFallback(
    { a: "A", nested: { b: "B", c: "C" }, list: "L" },
    { nested: { b: "B-pl" }, list: "L-pl" },
  );
  expect(merged).toEqual({ a: "A", nested: { b: "B-pl", c: "C" }, list: "L-pl" });
});
