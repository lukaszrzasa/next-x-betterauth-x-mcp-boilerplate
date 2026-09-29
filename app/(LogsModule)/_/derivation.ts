import type { Redactor } from "./redaction";
import { snapshotLabelSchema } from "./schema";
import { ANONYMOUS_ACTOR_LABEL, type ActorSnapshot, type LogContext } from "./types";

/**
 * Server-derived values computed from an already *redacted* email record:
 * the requester, the metadata search document and the canonical form hashed
 * for idempotency. Pure; kept apart from the service so the rules can be
 * tested without a database. Callers never supply any of these.
 */

/** Shown when an account's name is empty; the ID stays the identity, never an email. */
export const UNNAMED_USER_LABEL = "Unnamed user";

/**
 * The actor (or email requester) of a recording, from the context alone:
 * the signed-in user's ID and current name, or Anonymous for a public
 * operation - never the subject, never a cookie read inside a public
 * operation, never input. The name is a display field: redacted, then
 * trimmed and bounded like any snapshot label (a context value is clipped,
 * not rejected, so an unusual name cannot block recording).
 */
export function actorFromContext(ctx: LogContext, redactor: Redactor): ActorSnapshot {
  if (!ctx.user) return { kind: "anonymous", label: ANONYMOUS_ACTOR_LABEL };
  const name = clipText(redactor.text(ctx.user.name ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ").trim(), 200);
  const label = snapshotLabelSchema.safeParse(name);
  return { kind: "user", id: ctx.user.id, label: label.success ? label.data : UNNAMED_USER_LABEL };
}

/** At most `max` UTF-16 units, ending in "…" when cut, never splitting a surrogate pair. */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = max - 1;
  const unit = text.charCodeAt(cut - 1);
  if (unit >= 0xd800 && unit <= 0xdbff) cut -= 1;
  return `${text.slice(0, cut)}…`;
}

/** The email search document: the redacted subject and the recipient; never the body or diagnostics. */
export function deriveEmailSearchText(record: {
  subject: string;
  recipientEmail: string;
  recipientLabel: string | null;
}): string {
  return [record.subject, record.recipientEmail, record.recipientLabel]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

/** Hex SHA-256 of UTF-8 text through Web Crypto, available on the server and in tests alike. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type Canonical = null | boolean | number | string | Canonical[] | { [key: string]: Canonical };

/**
 * Deterministic JSON: object keys sorted recursively, array order kept,
 * `undefined` members dropped, dates as ISO 8601 UTC. Two semantically equal
 * payloads serialize identically, whatever order their keys were built in.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(toCanonical(value));
}

function toCanonical(value: unknown): Canonical {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers have no canonical form.");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => (entry === undefined ? null : toCanonical(entry)));
  if (typeof value === "object") {
    const result: { [key: string]: Canonical } = {};
    for (const key of Object.keys(value).sort()) {
      const member = (value as Record<string, unknown>)[key];
      if (member !== undefined) result[key] = toCanonical(member);
    }
    return result;
  }
  throw new TypeError(`Values of type ${typeof value} have no canonical form.`);
}
