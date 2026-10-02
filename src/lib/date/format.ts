import { createFormatter } from "next-intl";

import { appConfig } from "@/src/lib/config";
import { formats } from "@/src/lib/i18n/formats";
import type { Locale } from "@/src/lib/i18n/locales";

/**
 * Canonical date presentation outside a React tree (hooks that build
 * strings, emails, operations). Components use `useFormatter()` /
 * `getFormatter()` with the same named presets (`src/lib/i18n/formats.ts`),
 * so every surface shows an instant the same way: in the request's locale,
 * in UTC with the zone named. Locale is part of the contract, never
 * inferred from the machine, so server-rendered and hydrated output agree.
 *
 * Calendar dates without a time-of-day are a different concept and must not
 * be routed through these helpers to gain a timezone conversion.
 */

/** Messages are not needed to format a date, so the catalogs stay out of client bundles. */
const formatterFor = (locale: Locale) => createFormatter({ locale, formats, timeZone: appConfig.timeZone });

function toInstant(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** "Sep 25, 2026" / "25 wrz 2026"; `fallback` for an unreadable instant. */
export function formatUtcDate(value: Date | string, locale: Locale, fallback = ""): string {
  const date = toInstant(value);
  if (!date) return fallback;
  return formatterFor(locale).dateTime(date, "date");
}

/** "Sep 25, 2026, 02:32 PM UTC" / "25 wrz 2026, 14:32 UTC". */
export function formatUtcDateTime(value: Date | string, locale: Locale, fallback = ""): string {
  const date = toInstant(value);
  if (!date) return fallback;
  return formatterFor(locale).dateTime(date, "dateTime");
}

/** The machine-readable value for `<time dateTime>`. */
export function toIsoInstant(value: Date | string): string {
  const date = toInstant(value);
  return date ? date.toISOString() : "";
}
