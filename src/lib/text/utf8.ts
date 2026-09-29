/**
 * UTF-8 size helpers for limits that are defined in bytes (storage columns,
 * payload budgets) rather than in JavaScript's UTF-16 code units. Pure and
 * isomorphic; nothing here allocates an encoded copy of the input.
 *
 * Lone surrogates count as the three bytes of U+FFFD, which is what the
 * WHATWG encoder (and therefore `Buffer`, `TextEncoder` and the PostgreSQL
 * driver) writes in their place.
 */

/** Bytes needed to encode one code point that starts at `index`, and how many code units it spans. */
function codePointAt(text: string, index: number): { bytes: number; units: number } {
  const unit = text.charCodeAt(index);
  if (unit < 0x80) return { bytes: 1, units: 1 };
  if (unit < 0x800) return { bytes: 2, units: 1 };
  if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
    const next = text.charCodeAt(index + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return { bytes: 4, units: 2 };
  }
  return { bytes: 3, units: 1 };
}

/** The encoded length of `text` in bytes. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; ) {
    const point = codePointAt(text, index);
    bytes += point.bytes;
    index += point.units;
  }
  return bytes;
}

/**
 * The longest prefix of `text` whose encoding fits in `maxBytes`, never
 * ending inside a code point (a surrogate pair is kept or dropped whole).
 */
export function truncateUtf8(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  let bytes = 0;
  let index = 0;
  while (index < text.length) {
    const point = codePointAt(text, index);
    if (bytes + point.bytes > maxBytes) break;
    bytes += point.bytes;
    index += point.units;
  }
  return index === text.length ? text : text.slice(0, index);
}
