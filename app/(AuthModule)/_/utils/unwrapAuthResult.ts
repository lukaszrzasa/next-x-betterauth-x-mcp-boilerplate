type AuthClientResult<T> = {
  data: T;
  error: { message?: string } | null;
};

/** Returns Better Auth client data, or throws its error for the form to show. */
export function unwrapAuthResult<T>(
  result: AuthClientResult<T>,
  fallbackMessage: string,
): T {
  if (result.error) {
    throw new Error(result.error.message || fallbackMessage);
  }

  return result.data;
}

