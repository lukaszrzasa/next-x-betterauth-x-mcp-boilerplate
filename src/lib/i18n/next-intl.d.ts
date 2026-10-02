import type { AppMessages } from "@/src/lib/app/messages";
import type { formats } from "./formats";
import type { Locale as AppLocale } from "./locales";

/**
 * Typed keys and locales for next-intl: `t("auth.signIn.title")` fails to
 * compile when the English catalog has no such key, and `useLocale()` is
 * narrowed to the locales this build serves.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: AppMessages;
    Formats: typeof formats;
  }
}
