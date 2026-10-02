type AuthClientResult<T> = {
  data: T;
  error: { message?: string } | null;
};

/**
 * Returns Better Auth client data, or throws its error for the form to show.
 * The provider's message arrives already localized (`localizeProviderErrors`);
 * `fallbackMessage` is the caller's own translated text for an error without one.
 */
export function unwrapAuthResult<T>(
  result: AuthClientResult<T>,
  fallbackMessage: string,
): T {
  if (result.error) {
    throw new Error(result.error.message || fallbackMessage);
  }

  return result.data;
}
