import type { AbstractIntlMessages } from "next-intl";
import { createFormatter, createTranslator } from "next-intl";

import { DEFAULT_LOCALE, type Locale } from "@/src/lib/i18n/locales";
import { formats } from "@/src/lib/i18n/formats";
import { withFallback } from "@/src/lib/i18n/merge";
import { appConfig } from "@/src/lib/config";
import { messages as en } from "./en";
import { messages as pl } from "./pl";

/**
 * The composed catalogs and the two ways code outside React reads them.
 * Pages and components use next-intl's hooks and server functions, which
 * get the same catalog through `src/lib/i18n/request.ts`; adapters, emails
 * and tests go through `translatorFor`. Isomorphic: no framework reads.
 */

export type AppMessages = typeof en;

const catalogs: Record<Locale, AbstractIntlMessages> = {
  en,
  pl: withFallback(en, pl),
};

/** The full catalog of a locale, with English behind every missing key. */
export function messagesFor(locale: Locale): AbstractIntlMessages {
  return catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
}

/** A translator over the whole catalog, for code that has a locale but no React tree. */
export function translatorFor(locale: Locale) {
  return createTranslator<AppMessages>({
    locale,
    messages: messagesFor(locale) as AppMessages,
    formats,
    timeZone: appConfig.timeZone,
  });
}

export function formatterFor(locale: Locale) {
  return createFormatter({ locale, formats, timeZone: appConfig.timeZone });
}
