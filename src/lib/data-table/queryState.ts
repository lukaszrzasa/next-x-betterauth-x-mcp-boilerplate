/**
 * URL search-parameter primitives for list pages. Pure and isomorphic: the
 * server parses the page's raw `searchParams`, the client parses
 * `useSearchParams()`, and both build canonical URLs with the same rules.
 * Nothing here knows a specific list's parameter names; each list owns its
 * codec (defaults, reset rules) and composes these helpers.
 */

/** The shape Next hands a page: repeated keys arrive as arrays. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * The query string a page was actually requested with ("" or "?…"), rebuilt
 * from its raw params in their given order, so it can be compared with the
 * canonical form to decide whether to redirect.
 */
export function serializeRawSearchParams(raw: RawSearchParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) search.append(key, entry);
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

/** `URLSearchParams` → the page-props shape, so one parser serves both sides. */
export function toRawSearchParams(search: URLSearchParams): RawSearchParams {
  const raw: RawSearchParams = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    raw[key] = values.length === 1 ? values[0] : values;
  }
  return raw;
}

/**
 * A supported key given more than once is invalid *for that key*: it resolves
 * to its default rather than an arbitrary first or last value.
 */
export function readSingle(raw: RawSearchParams, key: string): string | undefined {
  const value = raw[key];
  return typeof value === "string" ? value : undefined;
}

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]+/g;

/**
 * Trimmed text, truncated to `maxLength`; absent or repeated resolves to "".
 * Control characters become spaces (PostgreSQL text cannot even hold U+0000),
 * the cut never splits a surrogate pair, and the result is trimmed again, so
 * parsing a canonical value yields the same value.
 */
export function parseText(value: string | undefined, maxLength: number): string {
  const text = (value ?? "").replace(CONTROL_CHARACTERS, " ").trim();
  if (text.length <= maxLength) return text;
  const unit = text.charCodeAt(maxLength - 1);
  const cut = unit >= 0xd800 && unit <= 0xdbff ? maxLength - 1 : maxLength;
  return text.slice(0, cut).trim();
}

/** One of `allowed`, otherwise `fallback`. */
export function parseEnum<const T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** A decimal positive integer no larger than `max`; anything else is `fallback`. */
export function parsePositiveInt(
  value: string | undefined,
  max: number,
  fallback: number,
): number {
  if (value === undefined || !/^\d{1,15}$/.test(value)) return fallback;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= max ? parsed : fallback;
}

/** One of the listed numbers, otherwise `fallback`. */
export function parseOneOf<const T extends number>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const parsed = value !== undefined && /^\d{1,6}$/.test(value) ? Number(value) : NaN;
  return (allowed as readonly number[]).includes(parsed) ? (parsed as T) : fallback;
}

export type SerializableParam = {
  key: string;
  value: string | number;
  /** Omitted from the URL when equal to the value. */
  default: string | number;
};

/**
 * The canonical query string: parameters in the order given, defaults
 * omitted, values encoded. Returns "" when every value is a default, so a
 * caller can append the result to a pathname directly.
 */
export function serializeParams(params: readonly SerializableParam[]): string {
  const search = new URLSearchParams();
  for (const param of params) {
    if (param.value !== param.default) search.set(param.key, String(param.value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

/** The 1-based last page for a total, never below 1. */
export function lastPage(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
