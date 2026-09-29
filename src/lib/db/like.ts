/**
 * LIKE/ILIKE treat `%`, `_` and the escape character specially; literal
 * search text must not. Escape it, wrap it in `%…%` yourself, bind it as a
 * parameter, and pair it with `ESCAPE '\'` in the SQL.
 */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** A bound-ready "contains" pattern for `text`: `%<escaped>%`. */
export function containsPattern(text: string): string {
  return `%${escapeLikePattern(text)}%`;
}
