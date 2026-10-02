import type { z } from "zod";
import { en, pl } from "zod/locales";

import type { Locale } from "./locales";

/**
 * Zod's own messages (a wrong type, an invalid email, a too-short string
 * without a custom message) in the request's locale. Passed per parse, never
 * through `z.config`: that is process-global and the server handles several
 * locales at once.
 */
const LOCALE_ERROR_MAPS: Record<Locale, () => { localeError: z.core.$ZodErrorMap }> = { en, pl };

export function zodErrorMap(locale: Locale): z.core.$ZodErrorMap {
  return LOCALE_ERROR_MAPS[locale]().localeError;
}

/**
 * A schema's custom messages are catalog keys (`"auth.validation.emailTooLong"`),
 * so schemas stay plain values shared by the client form and the server
 * operation. An issue's message is translated by whoever reports it: the
 * form resolver in the browser, the action adapter on the server. Values
 * the key may interpolate are the issue's own bounds.
 */
export type IssueTranslator = (key: string, values?: Record<string, string | number>) => string | null;

export function translateIssueMessage(
  translate: IssueTranslator,
  issue: { message: string; minimum?: unknown; maximum?: unknown },
): string {
  const values: Record<string, string | number> = {};
  if (typeof issue.minimum === "number") values.minimum = issue.minimum;
  if (typeof issue.maximum === "number") values.maximum = issue.maximum;
  return translate(issue.message, values) ?? issue.message;
}
