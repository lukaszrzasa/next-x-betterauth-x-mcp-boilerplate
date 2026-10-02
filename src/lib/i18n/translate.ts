import { translatorFor } from "@/src/lib/app/messages";
import type { Locale } from "./locales";
import { isMessageDescriptor, type MessageDescriptor, type MessageKey } from "./messageKey";
import { translateIssueMessage } from "./zod";

/**
 * Text for a catalog key when it exists, otherwise null. The key is checked
 * against the catalog so a message that is already prose (a Zod default, a
 * developer string) passes through untouched.
 */
export function translateKey(
  locale: Locale,
  key: string,
  values?: Record<string, string | number | Date>,
): string | null {
  const t = translatorFor(locale);
  if (!t.has(key as MessageKey)) return null;
  // Values are validated by the catalog's ICU message, not by the key type.
  return (t as (key: string, values?: Record<string, string | number | Date>) => string)(key, values);
}

export function translateDescriptor(locale: Locale, descriptor: MessageDescriptor): string {
  return translateKey(locale, descriptor.key, descriptor.values) ?? descriptor.key;
}

/** A descriptor becomes text; a string (developer-facing) stays as is. */
export function translateMessage(locale: Locale, message: string | MessageDescriptor): string {
  return isMessageDescriptor(message) ? translateDescriptor(locale, message) : message;
}

/** The message of a validation issue in the request's locale. */
export function translateIssue(
  locale: Locale,
  issue: { message: string; minimum?: unknown; maximum?: unknown },
): string {
  return translateIssueMessage((key, values) => translateKey(locale, key, values), issue);
}
