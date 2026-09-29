/** What a query builder's error carries besides its message (Drizzle's `DrizzleQueryError`). */
type QueryError = Error & { query: string; params: unknown[] };

const OMITTED_PARAMETERS = "[omitted]";

function isQueryError(error: Error): error is QueryError {
  const candidate = error as Partial<QueryError>;
  return typeof candidate.query === "string" && Array.isArray(candidate.params);
}

/**
 * The message and stack of an error, safe to write down. A query builder's
 * error repeats the statement's bound parameters in its message, and so in
 * its stack: password hashes, token digests, addresses - values no caller
 * declared, because none of them saw them. Those are replaced, the statement
 * kept. Recognized by shape (a `query` string and a `params` array); a
 * stack that does not begin with the message it would have to rewrite is
 * dropped rather than kept with the values in it.
 */
export function describeErrorSafely(error: Error): { message: string; stack: string | undefined } {
  if (!isQueryError(error)) return { message: error.message, stack: error.stack };
  const message = `Failed query: ${error.query}\nparams: ${OMITTED_PARAMETERS}`;
  const header = `${error.name}: ${error.message}`;
  const stack = error.stack?.startsWith(header) ? `${error.name}: ${message}${error.stack.slice(header.length)}` : undefined;
  return { message, stack };
}

/** A loggable description of anything thrown: the message of an `Error`, otherwise its string form. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? describeErrorSafely(error).message : String(error);
}
