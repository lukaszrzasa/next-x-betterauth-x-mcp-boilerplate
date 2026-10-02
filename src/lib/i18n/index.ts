/**
 * Localization primitives with no module dependencies: what a locale is,
 * how a request's locale is found, the formatting presets and the shape of
 * a translatable refusal. The composed catalogs live in `src/lib/app/messages`.
 */
export { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, LOCALE_HEADER, isLocale, type Locale } from "./locales";
export { negotiateLocale, requestLocale } from "./resolveLocale";
export { formats, type DateTimeFormatName } from "./formats";
export { withFallback } from "./merge";
export {
  isMessageDescriptor,
  msg,
  type MessageDescriptor,
  type MessageKey,
  type MessageValues,
} from "./messageKey";
