/** PostgreSQL `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

/** Drivers and query builders wrap the server's error; the original is somewhere on the cause chain. */
const MAX_CAUSE_DEPTH = 5;

/**
 * The constraint a unique violation broke, or `null` when `error` is not
 * one. Callers compare the name: a table can carry several unique
 * constraints, and only the expected one is a known conflict.
 */
export function uniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && typeof current === "object" && current !== null; depth += 1) {
    const { code, constraint, cause } = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (code === UNIQUE_VIOLATION) return typeof constraint === "string" ? constraint : "";
    current = cause;
  }
  return null;
}
