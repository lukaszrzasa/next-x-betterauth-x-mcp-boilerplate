import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { resolveAuthoritativeSession, type AuthoritativeSession } from "./sessionAuthority";

/**
 * The session as the store knows it right now, bypassing the cookie cache
 * (which may be up to `maxAge` stale), with the user as the database knows
 * it right now (`sessionAuthority`). Wrapped in React's request-scoped
 * `cache` so the root layout and a page guard rendering in the same request
 * share one store read and one user read. Deliberately not persisted across
 * requests: the session is authority, not data. The proxy runs outside React
 * and performs its own cookie-based read for navigation hints only.
 */
export const getFreshSession = cache(async () => {
  return resolveAuthoritativeSession(await headers());
});

export type FreshSession = AuthoritativeSession;
