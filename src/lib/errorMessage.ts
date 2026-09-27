/** A loggable description of anything thrown: the message of an `Error`, otherwise its string form. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
