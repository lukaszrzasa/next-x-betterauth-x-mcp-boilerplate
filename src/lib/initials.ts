/**
 * Up to two letters standing in for a missing avatar: the first letters of
 * the first and last name, or the first two characters of a single name or
 * of the email when there is no name at all.
 */
export function initialsOf(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : (parts[0] ?? email).slice(0, 2);

  return letters.toUpperCase();
}
