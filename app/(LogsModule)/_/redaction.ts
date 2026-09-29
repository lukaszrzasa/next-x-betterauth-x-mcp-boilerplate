import { describeErrorSafely } from "@/src/lib/errorMessage";
import { truncateUtf8, utf8ByteLength } from "@/src/lib/text/utf8";
import { LogRecordingError, type Scalar } from "./types";
import { LOG_LIMITS, type SecretsInput } from "./schema";

/**
 * The logs module's content policy (redaction version 1), applied to every
 * display-bearing field before anything is persisted, previewed, indexed for
 * search or hashed. There is no raw-content storage and no "reveal".
 *
 * 1. Declared secrets - exact strings the producer supplies, plus their
 *    `encodeURIComponent` and HTML-escaped forms - are replaced by
 *    `[REDACTED]`. Matching is literal (`indexOf`, never a regular expression
 *    built from a secret) and every character covered by any occurrence of
 *    any secret is removed, so overlapping secrets cannot leave a fragment.
 * 2. Complete http(s) and mailto URLs are replaced by `[REDACTED LINK]`, even
 *    when undeclared; logs never carry a live external link.
 * 3. Values of denied structured keys (`password`, `token`, `code`, ...) are
 *    replaced by `[REDACTED]` whatever their type.
 *
 * The module cannot remove a secret the producer did not declare, or an
 * encoding it does not know: declaring every sensitive value (and any other
 * transformation of it that appears in the text) is the integration's
 * responsibility. Six-digit numbers are deliberately *not* blanked by
 * pattern: IDs, dates and counts look the same.
 */

export const REDACTED = "[REDACTED]";
export const REDACTED_LINK = "[REDACTED LINK]";
export const TRUNCATION_MARKER = "\n[truncated]";

export const SECRET_LIMITS = { maxValues: 100, maxValueBytes: 8 * 1024 } as const;

/**
 * Structured keys whose values are never kept, compared case-insensitively
 * after removing separators (`new_password`, `New-Password` and `newPassword`
 * are the same key). Exact names: `errorCode` or `zipCode` are not `code`.
 */
const DENIED_KEYS = new Set(
  [
    "password",
    "currentPassword",
    "newPassword",
    "token",
    "accessToken",
    "refreshToken",
    "secret",
    "otp",
    "code",
    "authenticatorCode",
    "recoveryCode",
    "recoveryCodes",
    "backupCodes",
    "authorization",
    "cookie",
    "sessionToken",
  ].map(normalizeKey),
);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_.\-]/g, "");
}

export function isDeniedKey(key: string): boolean {
  return DENIED_KEYS.has(normalizeKey(key));
}

const MAX_SECRET_SEARCH_DEPTH = 8;

/**
 * Every string held under a denied key anywhere in `value` (an operation's
 * parsed input, say), as declared secrets: a password is removed from a
 * diagnostic even when the producer did not name it. Nonstring values under
 * a denied key cannot be matched in text and are skipped; so are strings
 * too large to be a secret, which the recorder would refuse. Bounded in
 * depth and count, so an unusual input cannot make recording fail.
 */
export function collectDeniedKeySecrets(value: unknown): SecretsInput {
  const found = new Set<string>();
  const take = (candidate: unknown) => {
    if (
      typeof candidate === "string" &&
      candidate.length > 0 &&
      utf8ByteLength(candidate) <= SECRET_LIMITS.maxValueBytes &&
      found.size < SECRET_LIMITS.maxValues
    ) {
      found.add(candidate);
    }
  };
  const visit = (node: unknown, depth: number) => {
    if (depth > MAX_SECRET_SEARCH_DEPTH || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (isDeniedKey(key)) {
        if (Array.isArray(child)) child.forEach(take);
        else take(child);
      } else {
        visit(child, depth + 1);
      }
    }
  };
  visit(value, 0);
  return found.size > 0 ? { deniedKeys: [...found] } : {};
}

// ---------------------------------------------------------------------------
// Secret variants
// ---------------------------------------------------------------------------

function escapeHtml(text: string, apostrophe: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", apostrophe);
}

/** `encodeURIComponent` throws on lone surrogates; such a value has no encoded form. */
function uriComponent(text: string): string | null {
  try {
    return encodeURIComponent(text);
  } catch {
    return null;
  }
}

/** The literal value and the textual forms it takes in a rendered email or URL. */
function variantsOf(secret: string): string[] {
  const encoded = uriComponent(secret);
  const forms = [secret, escapeHtml(secret, "&#39;"), escapeHtml(secret, "&#x27;")];
  if (encoded) forms.push(encoded, escapeHtml(encoded, "&#39;"), escapeHtml(encoded, "&#x27;"));
  return forms;
}

/**
 * Flattens, bounds and expands the declared secrets. Empty values are
 * ignored; the count and size limits reject rather than silently dropping a
 * secret, which would store it.
 */
function compilePatterns(secrets: SecretsInput): string[] {
  const values: string[] = [];
  for (const entry of Object.values(secrets)) {
    for (const value of typeof entry === "string" ? [entry] : entry) {
      if (typeof value !== "string") {
        throw new LogRecordingError("INVALID_RECORD", [{ path: "secrets", code: "invalid_type" }]);
      }
      // Normalized like the text it is matched against (see `normalizeText`).
      if (value.length > 0) values.push(normalizeText(value));
    }
  }
  const unique = [...new Set(values)];
  if (unique.length > SECRET_LIMITS.maxValues) {
    throw new LogRecordingError("INVALID_RECORD", [{ path: "secrets", code: "too_many" }]);
  }
  if (unique.some((value) => utf8ByteLength(value) > SECRET_LIMITS.maxValueBytes)) {
    throw new LogRecordingError("INVALID_RECORD", [{ path: "secrets", code: "too_big" }]);
  }
  const patterns = new Set(unique.flatMap(variantsOf).filter((pattern) => pattern.length > 0));
  // Longest first: used by `containsSecret` only for early exit; the interval
  // union below does not depend on order.
  return [...patterns].sort((a, b) => b.length - a.length);
}

/** Every [start, end) range covered by an occurrence of a pattern, overlaps included. */
function coveredRanges(text: string, patterns: readonly string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const pattern of patterns) {
    for (let index = text.indexOf(pattern); index !== -1; index = text.indexOf(pattern, index + 1)) {
      ranges.push([index, index + pattern.length]);
    }
  }
  return ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
}

function replaceSecrets(text: string, patterns: readonly string[]): string {
  if (patterns.length === 0 || text.length === 0) return text;
  const ranges = coveredRanges(text, patterns);
  if (ranges.length === 0) return text;

  let result = "";
  let cursor = 0;
  let [start, end] = ranges[0];
  for (let index = 1; index <= ranges.length; index += 1) {
    const next = ranges[index];
    // Overlapping or touching occurrences collapse into one marker.
    if (next && next[0] <= end) {
      end = Math.max(end, next[1]);
      continue;
    }
    result += text.slice(cursor, start) + REDACTED;
    cursor = end;
    if (next) [start, end] = next;
  }
  return result + text.slice(cursor);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * A scheme and everything up to whitespace, a double quote, a backtick or an
 * angle bracket (none of which may appear unencoded in a URL). An apostrophe
 * may (`?name=O'Brien`), so it is part of the match and only dropped when it
 * trails; erring towards removing a little prose is the safe direction.
 */
const LINK = /(?:https?:\/\/|mailto:)[^\s<>"`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?']$/;
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/**
 * Trailing punctuation belongs to the sentence, not the URL: "see
 * https://x.test/a." keeps its full stop, and a closing bracket stays outside
 * unless the URL itself opened one.
 */
function splitTrailing(match: string): [string, string] {
  let url = match;
  let trailing = "";
  for (;;) {
    const last = url.at(-1) ?? "";
    const opener = CLOSERS[last];
    const unbalanced = opener !== undefined && url.split(opener).length <= url.split(last).length - 1;
    if (TRAILING_PUNCTUATION.test(last) || unbalanced) {
      trailing = last + trailing;
      url = url.slice(0, -1);
      continue;
    }
    return [url, trailing];
  }
}

function replaceLinks(text: string): string {
  return text.replace(LINK, (match) => {
    const [url, trailing] = splitTrailing(match);
    return url.length > 0 ? REDACTED_LINK + trailing : match;
  });
}

// ---------------------------------------------------------------------------
// Redactor
// ---------------------------------------------------------------------------

/**
 * PostgreSQL text and jsonb cannot hold U+0000, and lone surrogates are not
 * valid UTF-8; both become U+FFFD so a provider's odd diagnostic cannot make
 * the write fail.
 */
function normalizeText(text: string): string {
  return text.replaceAll("\u0000", "�").toWellFormed();
}

export type Redactor = {
  /** Redacts a display string (labels, subjects, bodies, text blocks, diagnostics). */
  text(value: string): string;
  /** Redacts a structured value under `key`: denied keys lose the value whatever its type. */
  scalar(key: string, value: Scalar): Scalar;
  /** True when a declared secret, or one of its supported variants, occurs in `value`. */
  containsSecret(value: string): boolean;
};

/** Builds the redactor for one recording; the secrets live only in this closure. */
export function createRedactor(secrets: SecretsInput): Redactor {
  const patterns = compilePatterns(secrets);

  const text = (value: string) => replaceLinks(replaceSecrets(normalizeText(value), patterns));

  return {
    text,
    scalar(key, value) {
      if (isDeniedKey(key)) return REDACTED;
      if (typeof value === "string") return text(value);
      // A code passed as a number is still the code: a number cannot be
      // partly redacted, so one whose digits hold a secret is replaced whole.
      if (typeof value === "number" && patterns.some((pattern) => String(value).includes(pattern))) return REDACTED;
      return value;
    },
    containsSecret(value) {
      const normalized = normalizeText(value);
      return patterns.some((pattern) => normalized.includes(pattern));
    },
  };
}

/** A structural value (key, ID, type, name) and where it sits in the record. */
export type StructuralField = [path: string, value: string | null | undefined];

/**
 * Structural fields are validated, never rewritten: turning an ID into a
 * placeholder would silently break the reference. A declared secret (or a
 * supported variant) in one of them rejects the whole record instead,
 * naming the paths only.
 */
export function assertNoStructuralSecrets(redactor: Redactor, fields: readonly StructuralField[]): void {
  const hits = fields.filter(
    (field): field is [string, string] => typeof field[1] === "string" && redactor.containsSecret(field[1]),
  );
  if (hits.length > 0) {
    throw new LogRecordingError(
      "INVALID_RECORD",
      hits.map(([path]) => ({ path, code: "sensitive_value" })),
    );
  }
}

/**
 * Bounds an already-redacted diagnostic: at most `maxBytes` of UTF-8,
 * including the truncation marker, cut on a code point boundary. Redaction
 * runs first, so a token split by the cut was already removed.
 */
export function truncateDiagnostic(text: string, maxBytes: number): string {
  if (utf8ByteLength(text) <= maxBytes) return text;
  return truncateUtf8(text, maxBytes - utf8ByteLength(TRUNCATION_MARKER)) + TRUNCATION_MARKER;
}

/** Character-bounded variant for diagnostics stored with a character limit. */
export function truncateDiagnosticChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let cut = maxChars - TRUNCATION_MARKER.length;
  // Never split a surrogate pair.
  const unit = text.charCodeAt(cut - 1);
  if (unit >= 0xd800 && unit <= 0xdbff) cut -= 1;
  return text.slice(0, cut) + TRUNCATION_MARKER;
}

// ---------------------------------------------------------------------------
// Error serialization
// ---------------------------------------------------------------------------

const MAX_CAUSE_DEPTH = 5;
/** A part larger than this is omitted, never cut: cutting before redaction could split a token. */
const MAX_ERROR_PART_BYTES = 16 * 1024;
const OMITTED_PART = "[omitted: too large]";

/**
 * Turns a thrown value into the recorder's explicit diagnostic strings,
 * redacted with the same secrets. It reads only `name`, `message` and
 * `stack` along the `cause` chain (at most five levels); it never serializes
 * other properties of a provider error, which may hold request bodies,
 * headers or keys. The recorder redacts these strings again on write.
 */
export function serializeErrorForLog(
  error: unknown,
  secrets: SecretsInput,
): { errorMessage?: string; stackTrace?: string } {
  const redactor = createRedactor(secrets);
  const bounded = (value: unknown): string | undefined => {
    if (typeof value !== "string" || value.length === 0) return undefined;
    return utf8ByteLength(value) > MAX_ERROR_PART_BYTES ? OMITTED_PART : redactor.text(value);
  };

  const messages: string[] = [];
  const stacks: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    if (current instanceof Error) {
      const { message: rawMessage, stack: rawStack } = describeErrorSafely(current);
      const message = bounded(rawMessage);
      const name = bounded(current.name) ?? "Error";
      if (message) messages.push(`${name}: ${message}`);
      const stack = bounded(rawStack);
      if (stack) stacks.push(stack);
      current = current.cause;
    } else {
      const message = bounded(typeof current === "string" ? current : undefined);
      if (message) messages.push(message);
      break;
    }
  }

  // Already redacted, so cutting here cannot expose a partial secret; the
  // bounds are the recorder's input limits, so the result is always accepted.
  return {
    errorMessage:
      messages.length > 0
        ? truncateDiagnostic(messages.join("\nCaused by: "), LOG_LIMITS.errorMessageInputBytes)
        : undefined,
    stackTrace:
      stacks.length > 0
        ? truncateDiagnostic(stacks.join("\nCaused by: "), LOG_LIMITS.stackInputBytes)
        : undefined,
  };
}
