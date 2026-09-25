import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "./index";

/**
 * The session as the store knows it right now, bypassing the cookie cache
 * (which may be up to `maxAge` stale). Wrapped in React's request-scoped
 * `cache` so the root layout and a page guard rendering in the same request
 * share one store read. Deliberately not persisted across requests: the
 * session is authority, not data. The proxy runs outside React and performs
 * its own read.
 */
export const getFreshSession = cache(async () => {
  return auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
});

export type FreshSession = NonNullable<Awaited<ReturnType<typeof getFreshSession>>>;
