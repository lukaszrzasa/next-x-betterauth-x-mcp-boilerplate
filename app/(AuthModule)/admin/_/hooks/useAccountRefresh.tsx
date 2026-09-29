"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * What a confirmed change to the account on the detail page sets off: the
 * page is read again, so every section shows authoritative data, and the
 * count of changes moves on, which is what tells the account's staff log
 * that it may have grown.
 *
 * The count is kept here, in the browser, and not taken from the page's
 * render: the server renders the page again for reasons that change
 * nothing (any Server Action that touches a cookie, the staff log's own
 * read included), and a revision that moved on each render made that read
 * ask for itself again, without end.
 */

type AccountRefresh = { changes: number; changed: () => void };

const AccountRefreshContext = createContext<AccountRefresh | null>(null);

export function AccountRefreshProvider({ children }: { children: ReactNode }) {
  const [changes, setChanges] = useState(0);
  const changed = useCallback(() => setChanges((count) => count + 1), []);
  const value = useMemo(() => ({ changes, changed }), [changes, changed]);
  return <AccountRefreshContext value={value}>{children}</AccountRefreshContext>;
}

/** Call after a change that was confirmed, or when the account turned out to be gone. */
export function useAccountRefresh(): () => void {
  const router = useRouter();
  const changed = useContext(AccountRefreshContext)?.changed;
  return useCallback(() => {
    changed?.();
    router.refresh();
  }, [changed, router]);
}

/** How many confirmed changes this page has seen; moves on only with one. */
export function useAccountChanges(): number {
  return useContext(AccountRefreshContext)?.changes ?? 0;
}
