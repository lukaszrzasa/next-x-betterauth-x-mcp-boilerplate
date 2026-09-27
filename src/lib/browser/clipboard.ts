/**
 * Writes text to the system clipboard. Resolves `false` instead of throwing
 * when the clipboard is unavailable (an insecure context, a denied
 * permission, an unfocused document), so callers can offer manual copying.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
