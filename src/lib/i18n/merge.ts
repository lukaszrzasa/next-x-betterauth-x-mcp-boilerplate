import type { AbstractIntlMessages } from "next-intl";

/**
 * A locale's catalog over the default one: every key the translation lacks
 * keeps its English text, so a missing translation renders as English and
 * never as a raw key. The parity test (`tests/i18n`) is what keeps the gap
 * at zero; this is the runtime guarantee for the day it is not.
 */
export function withFallback(
  fallback: AbstractIntlMessages,
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  const merged: AbstractIntlMessages = { ...fallback };
  for (const [key, value] of Object.entries(messages)) {
    const base = fallback[key];
    merged[key] =
      isRecord(base) && isRecord(value) ? withFallback(base, value) : value;
  }
  return merged;
}

function isRecord(value: unknown): value is AbstractIntlMessages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
