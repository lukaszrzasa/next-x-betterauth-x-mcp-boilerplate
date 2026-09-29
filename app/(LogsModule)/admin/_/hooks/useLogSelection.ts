"use client";

import { useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toRawSearchParams, type RawSearchParams } from "@/src/lib/data-table/queryState";
import { parseLogSelection } from "@/app/(LogsModule)/admin/_/queryState";

/**
 * Commands read the address bar when they run, so their identity does not
 * change with every selection: table cells built from them stay mounted,
 * and with them the button that focus must return to.
 */
const currentSearch = () => window.location.search;

/**
 * The record a list's dialog shows, kept in the URL (`?log=<id>`) so a
 * selection can be shared, refreshed and revisited with Back/Forward.
 *
 * Selection changes use the native History API, which Next.js integrates
 * with `useSearchParams`: opening a record does not re-render the server
 * page or re-read the list. Opening and switching records push an entry;
 * closing *replaces* the current one without `log`, so Back does not reopen
 * a dialog that was just closed (and `router.back()` is never used, which
 * would leave the app from a shared link). Every URL is rebuilt with the
 * list's own canonical codec, so table criteria are preserved exactly.
 *
 * Focus returns to the control that opened the dialog when it is still
 * mounted, otherwise to the list heading (a direct link has no opener).
 */
export function useLogSelection({
  pathname,
  serialize,
  headingId,
}: {
  pathname: string;
  /** The list's canonical query string for the current URL with `log` set (or removed). */
  serialize: (raw: RawSearchParams, log: string | null) => string;
  headingId: string;
}) {
  const search = useSearchParams().toString();
  const selectedId = parseLogSelection(toRawSearchParams(new URLSearchParams(search)));
  const opener = useRef<HTMLElement | null>(null);

  const urlFor = useCallback(
    (fromSearch: string, log: string | null) =>
      `${pathname}${serialize(toRawSearchParams(new URLSearchParams(fromSearch)), log)}`,
    [pathname, serialize],
  );

  /** For rendering links (an attempt's `href`): the current URL with `log` replaced. */
  const hrefFor = useCallback((log: string | null) => urlFor(search, log), [urlFor, search]);

  /** Opens `id` from a control that focus should return to. */
  const open = useCallback(
    (id: string, from: HTMLElement | null) => {
      opener.current = from;
      window.history.pushState(null, "", urlFor(currentSearch(), id));
    },
    [urlFor],
  );

  /** Shows another record in the open dialog (an attempt of the same chain). */
  const select = useCallback((id: string) => window.history.pushState(null, "", urlFor(currentSearch(), id)), [urlFor]);

  const close = useCallback(() => window.history.replaceState(null, "", urlFor(currentSearch(), null)), [urlFor]);

  /** For the dialog's `onCloseAutoFocus`. */
  const restoreFocus = useCallback(
    (event: Event) => {
      event.preventDefault();
      const target = opener.current?.isConnected ? opener.current : document.getElementById(headingId);
      opener.current = null;
      target?.focus();
    },
    [headingId],
  );

  return { selectedId, hrefFor, open, select, close, restoreFocus };
}
