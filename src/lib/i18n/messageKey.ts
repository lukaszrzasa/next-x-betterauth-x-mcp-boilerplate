import type { MessageKeys, NestedKeyOf, Messages } from "next-intl";

/** A leaf key of the English catalog, e.g. `"errors.auth.invalidCode"`. */
export type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>;

/** Values an ICU message may interpolate. */
export type MessageValues = Record<string, string | number | Date>;

/**
 * What a server-side refusal says, as a key into the catalog plus its
 * arguments. Handlers and services raise these; the boundary adapter turns
 * them into text in the request's locale, so no operation ever picks a
 * language. A plain string stays what it was: a developer-facing message.
 */
export type MessageDescriptor = {
  key: MessageKey;
  values?: MessageValues;
};

export function isMessageDescriptor(value: unknown): value is MessageDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { key?: unknown }).key === "string"
  );
}

/** Shorthand for an error factory: `msg("errors.auth.invalidCode")`. */
export function msg(key: MessageKey, values?: MessageValues): MessageDescriptor {
  return values ? { key, values } : { key };
}
