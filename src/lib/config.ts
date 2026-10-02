/**
 * Static, framework-agnostic application configuration: values that are the
 * same for every request and safe in every bundle (server, client, email,
 * tests). Nothing here reads the environment; request-dependent state (the
 * current locale, the viewer) is resolved per request from these constants.
 *
 * `appName` is also Better Auth's TOTP `issuer` - the label authenticator
 * apps show next to the code. Changing it later invalidates nothing, but it
 * does rename every already-enrolled entry in users' authenticator apps, so
 * pick it once.
 *
 * `locales` is the hardcoded part of localization: the languages this build
 * serves, English first as the source of truth. A single-language product
 * narrows the list to one entry and negotiation becomes a no-op. There is no
 * language switcher; the proxy negotiates from the browser (see
 * `src/lib/i18n/resolveLocale.ts`).
 */
export const appConfig = {
  appName: "Boilerplate",
  locales: ["en", "pl"],
  defaultLocale: "en",
  /** Every instant is presented in UTC; timezone negotiation is deliberately absent. */
  timeZone: "UTC",
} as const;

export const appName = appConfig.appName;
