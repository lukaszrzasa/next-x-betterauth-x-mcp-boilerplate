"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Controlled URL navigation for a list whose state lives in the query
 * string. The caller owns the codec: it passes the current (server-parsed)
 * state and a serializer, and receives functions that navigate to a next
 * state. The hook knows nothing about parameter names.
 *
 * - `navigate(next)` pushes (filters, sort, pagination, page size).
 * - `navigateDebounced(next)` replaces after a pause (typing in search).
 * - `flush()` runs a pending debounced navigation now (Enter in search).
 *
 * A version counter makes every newer intent win: a pending debounce is
 * discarded when a push happens, when `flush` runs, and when the URL changes
 * underneath it (Back/Forward re-renders the page with a new `query`).
 * `pending` is the router transition, so callers can pause their controls.
 */
export function useTableNavigation<Q>({
  pathname,
  query,
  serialize,
}: {
  pathname: string;
  query: Q;
  /** The canonical query string for a state: "" or "?…". */
  serialize: (query: Q) => string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const version = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduled = useRef<{ next: Q } | null>(null);
  const current = serialize(query);
  const currentRef = useRef(current);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    scheduled.current = null;
    version.current += 1;
  }, []);

  // The URL changed (our own navigation landed, or history moved): whatever
  // was still waiting to be typed is older than what the page now shows.
  useEffect(() => {
    currentRef.current = current;
    return cancel;
  }, [current, cancel]);

  const commit = useCallback(
    (next: Q, mode: "push" | "replace") => {
      const url = `${pathname}${serialize(next)}`;
      if (url === `${pathname}${currentRef.current}`) return;
      startTransition(() => {
        if (mode === "push") router.push(url, { scroll: false });
        else router.replace(url, { scroll: false });
      });
    },
    [pathname, router, serialize],
  );

  const navigate = useCallback(
    (next: Q) => {
      cancel();
      commit(next, "push");
    },
    [cancel, commit],
  );

  const navigateDebounced = useCallback(
    (next: Q, delay = SEARCH_DEBOUNCE_MS) => {
      cancel();
      const own = version.current;
      scheduled.current = { next };
      timer.current = setTimeout(() => {
        timer.current = null;
        scheduled.current = null;
        if (own !== version.current) return;
        commit(next, "replace");
      }, delay);
    },
    [cancel, commit],
  );

  const flush = useCallback(() => {
    const waiting = scheduled.current;
    cancel();
    if (waiting) commit(waiting.next, "replace");
  }, [cancel, commit]);

  return { navigate, navigateDebounced, flush, pending };
}
