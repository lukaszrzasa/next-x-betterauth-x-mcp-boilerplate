import "server-only";

import { createTranslator } from "next-intl";

import { messagesFor, type AppMessages } from "@/src/lib/app/messages";
import { currentOperationContext } from "@/src/lib/auth/builders/context";
import { appConfig } from "@/src/lib/config";
import { formats } from "@/src/lib/i18n/formats";
import { DEFAULT_LOCALE, type Locale } from "@/src/lib/i18n/locales";
import { requestLocale } from "@/src/lib/i18n/resolveLocale";

/**
 * The language of an outgoing message: that of the operation asking for it,
 * or of the provider request that triggered it (sign-up, forgot password,
 * the sign-in code), or the default. Templates never choose; they render
 * what they are handed.
 */
export function emailLocale(providerRequest?: Headers | null): Locale {
  const ctx = currentOperationContext();
  if (ctx) return ctx.locale;
  return providerRequest ? requestLocale(providerRequest) : DEFAULT_LOCALE;
}

/** The `email` namespace of the catalog in one locale, for subjects and template copy. */
export function emailTranslator(locale: Locale) {
  return createTranslator<AppMessages, "email">({
    locale,
    messages: messagesFor(locale) as AppMessages,
    namespace: "email",
    formats,
    timeZone: appConfig.timeZone,
  });
}

export type EmailTranslator = ReturnType<typeof emailTranslator>;
