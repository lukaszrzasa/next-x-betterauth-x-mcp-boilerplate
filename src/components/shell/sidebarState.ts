/**
 * The desktop sidebar preference, shared by the server (root layout reads the
 * cookie for the first render) and the client (the sidebar writes it). Kept
 * out of the client component so the server can import plain values.
 */
export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/** Only an explicit "false" starts collapsed; absent or anything else expands. */
export function readSidebarState(value: string | undefined): boolean {
  return value !== "false";
}
