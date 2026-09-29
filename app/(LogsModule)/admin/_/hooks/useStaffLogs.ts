"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, type ActionFailure } from "@/src/lib/actions";
import { listStaffLogsAction } from "@/app/(LogsModule)/admin/_/actions";
import type { StaffLogsPage, StaffLogsQuery } from "@/app/(LogsModule)/admin/_/types";

/**
 * What an embedded staff log shows. `page` stays while the next one loads,
 * so a search or a page change never empties the list in between.
 * - `failed`: a transport or server failure; `retry` repeats the read.
 * - `refused`: the session or its authority ended; the shared handler has
 *   already said so, and nothing is kept.
 */
export type StaffLogsState =
  | { status: "loading"; page: StaffLogsPage | null }
  | { status: "loaded"; page: StaffLogsPage }
  | { status: "failed"; retry: () => void }
  | { status: "refused" };

const RETRYABLE: ReadonlySet<ActionFailure["reason"]> = new Set(["TRANSPORT", "INTERNAL", "RATE_LIMITED"]);

/** Handled in the widget, so the shared alert is suppressed; refusals keep the shared handling. */
const handleInWidget = (error: ActionFailure) => RETRYABLE.has(error.reason);

/**
 * Reads the staff log for a query held in component state. The newest
 * request wins: an answer to an earlier query is dropped. `revision` reloads
 * the same query when the host knows the log may have grown.
 */
export function useStaffLogs(query: StaffLogsQuery, revision: unknown): StaffLogsState {
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef<Promise<unknown> | null>(null);
  const { execute } = useAction(listStaffLogsAction, { onError: handleInWidget });
  // The query is rebuilt on every render; its content decides whether to read again.
  const key = JSON.stringify(query);
  // One identity per read: what was settled belongs to the request that asked for it.
  const request = useMemo(() => ({ key, attempt, revision }), [key, attempt, revision]);
  const [settled, setSettled] = useState<{ request: object; outcome: Settled } | null>(null);
  const [lastPage, setLastPage] = useState<StaffLogsPage | null>(null);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      // The action runtime answers a second concurrent call `busy`: wait for the one in flight.
      while (inFlight.current) await inFlight.current;
      if (disposed) return;
      const pending = execute(JSON.parse(request.key) as StaffLogsQuery);
      const tracked = pending.catch(() => undefined);
      inFlight.current = tracked;
      let outcome: Awaited<typeof pending>;
      try {
        outcome = await pending;
      } finally {
        if (inFlight.current === tracked) inFlight.current = null;
      }
      if (disposed || outcome.status === "cancelled") return;

      if (outcome.status === "success") {
        setLastPage(outcome.data);
        setSettled({ request, outcome: { status: "loaded", page: outcome.data } });
      } else if (outcome.status === "error" && !RETRYABLE.has(outcome.error.reason)) {
        setLastPage(null);
        setSettled({ request, outcome: { status: "refused" } });
      } else {
        setSettled({ request, outcome: { status: "failed" } });
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, [execute, request]);

  if (settled?.request !== request) return { status: "loading", page: lastPage };
  return settled.outcome.status === "failed" ? { status: "failed", retry } : settled.outcome;
}

type Settled = { status: "loaded"; page: StaffLogsPage } | { status: "failed" } | { status: "refused" };
