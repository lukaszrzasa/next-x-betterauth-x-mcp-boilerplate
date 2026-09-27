/** "a•••@example.com": enough for the owner to recognise the mailbox, nothing more. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const hidden = Math.max(2, Math.min(local.length - 1, 6));
  return `${local[0]}${"•".repeat(hidden)}@${domain}`;
}
