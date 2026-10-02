import { appConfig } from "@/src/lib/config";

/** A language this build serves; the union is derived from `appConfig.locales`. */
export type Locale = (typeof appConfig.locales)[number];

export const LOCALES: readonly Locale[] = appConfig.locales;
export const DEFAULT_LOCALE: Locale = appConfig.defaultLocale;

/**
 * Request header the proxy sets with the negotiated locale, and the only way
 * the app learns it. The proxy always overwrites it, so a client-supplied
 * value never passes through; it is validated with `isLocale` regardless.
 */
export const LOCALE_HEADER = "x-locale";

/** Cookie a future language switcher writes; nothing writes it yet. */
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
