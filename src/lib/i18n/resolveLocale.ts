import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, LOCALE_HEADER, isLocale, type Locale } from "./locales";

/**
 * The locale of a request, in precedence order: an explicit cookie, then the
 * browser's `Accept-Language`, then the default. Pure: reads only headers,
 * so the proxy, request config, action adapters and provider hooks all
 * agree. A stored per-user preference would be inserted first, when it exists.
 */
export function negotiateLocale(headers: Headers): Locale {
  const fromCookie = readCookie(headers.get("cookie"), LOCALE_COOKIE);
  if (isLocale(fromCookie)) return fromCookie;

  const acceptLanguage = headers.get("accept-language");
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const languages = new Negotiator({ headers: { "accept-language": acceptLanguage } }).languages();
  try {
    const matched = match(languages, LOCALES as readonly string[], DEFAULT_LOCALE);
    return isLocale(matched) ? matched : DEFAULT_LOCALE;
  } catch {
    // A malformed language tag is the browser's problem, not a 500.
    return DEFAULT_LOCALE;
  }
}

/**
 * The locale the proxy already negotiated for this request, read from its
 * header; negotiated afresh when the proxy did not run (a unit test, a
 * request that bypassed the matcher).
 */
export function requestLocale(headers: Headers): Locale {
  const negotiated = headers.get(LOCALE_HEADER);
  return isLocale(negotiated) ? negotiated : negotiateLocale(headers);
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
