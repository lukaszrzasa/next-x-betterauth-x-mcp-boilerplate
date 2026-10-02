import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { formatterFor, messagesFor, translatorFor } from "../../src/lib/app/messages";
import { formats } from "../../src/lib/i18n/formats";

/**
 * The catalog for component suites. Tests assert on English against the
 * real catalog, so a broken interpolation or plural shows up here, not in
 * production. `locale` lets a suite render Polish to prove nothing is
 * hardcoded.
 */
export function IntlWrapper({ children, locale = "en" }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)} formats={formats} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

/** A `wrapper` for Testing Library's `render(ui, { wrapper })`. */
export const withIntl = (locale = "en") =>
  function Wrapper({ children }) {
    return <IntlWrapper locale={locale}>{children}</IntlWrapper>;
  };

/** The whole-catalog translator, for expected strings in assertions: `t("auth.signIn.title")`. */
export const t = translatorFor("en");

/**
 * What `mock.module("next-intl/server", serverIntlMock)` returns for suites
 * that render server components or call server functions outside a request:
 * the English catalog, no `headers()` needed.
 */
export function serverIntlMock(locale = "en") {
  const translator = translatorFor(locale);
  return () => ({
    getLocale: async () => locale,
    getTranslations: async (namespaceOrOptions) => {
      const namespace =
        typeof namespaceOrOptions === "string" ? namespaceOrOptions : namespaceOrOptions?.namespace;
      if (!namespace) return translator;
      const scoped = (key, values) => translator(`${namespace}.${key}`, values);
      scoped.rich = (key, values) => translator.rich(`${namespace}.${key}`, values);
      scoped.has = (key) => translator.has(`${namespace}.${key}`);
      scoped.raw = (key) => translator.raw(`${namespace}.${key}`);
      return scoped;
    },
    getFormatter: async () => formatterFor(locale),
    getMessages: async () => messagesFor(locale),
    getTimeZone: async () => "UTC",
    getNow: async () => new Date(),
    setRequestLocale: () => {},
  });
}
