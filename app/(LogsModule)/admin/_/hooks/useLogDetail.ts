"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, type ActionFailure } from "@/src/lib/actions";
import type { ServerAction } from "@/src/lib/auth/builders/adapters";

/**
 * What a detail dialog shows for one selected record.
 * - `unavailable`: the record does not exist (or is not the caller's to see).
 * - `failed`: a transport or server failure; `retry` repeats the read only.
 * - `refused`: the session or its authority ended; the shared handler has
 *   already said so, and no content is kept.
 */
export type LogDetailState<T> =
  | { status: "loading" }
  | { status: "loaded"; detail: T }
  | { status: "unavailable" }
  | { status: "failed"; retry: () => void }
  | { status: "refused" };

const UNAVAILABLE: ReadonlySet<ActionFailure["reason"]> = new Set(["NOT_FOUND", "INVALID_INPUT"]);
const RETRYABLE: ReadonlySet<ActionFailure["reason"]> = new Set(["TRANSPORT", "INTERNAL", "RATE_LIMITED"]);

/**
 * Handled in the dialog, so the shared alert is suppressed; authentication
 * and authorization refusals return false and keep the shared handling.
 * Module-level so the action hook's `execute` keeps a stable identity.
 */
const handleInDialog = (error: ActionFailure) => UNAVAILABLE.has(error.reason) || RETRYABLE.has(error.reason);

/**
 * Loads one record on demand. The caller mounts one instance per selection
 * (keyed by the selection), so every selection has its own `useAction`
 * lifetime: a response for an earlier selection belongs to an unmounted
 * instance and can never replace newer content. `input` is fixed for the
 * lifetime; a retry re-runs the same read.
 *
 * React's development double mount starts a request, abandons it and mounts
 * again while the first is still in flight; the action hook answers the
 * second call `busy`, so this waits for the owned request to settle before
 * starting its own.
 */
export function useLogDetail<I, O>(action: ServerAction<I, O>, input: I): LogDetailState<O> {
  const [request] = useState(input);
  const [state, setState] = useState<LogDetailState<O>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef<Promise<unknown> | null>(null);
  const { execute } = useAction(action, { onError: handleInDialog });

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      while (inFlight.current) await inFlight.current;
      if (disposed) return;
      const pending = execute(request);
      const tracked = pending.catch(() => undefined);
      inFlight.current = tracked;
      let outcome: Awaited<typeof pending>;
      try {
        outcome = await pending;
      } finally {
        if (inFlight.current === tracked) inFlight.current = null;
      }
      if (disposed) return;

      switch (outcome.status) {
        case "success":
          setState({ status: "loaded", detail: outcome.data });
          return;
        case "error":
          if (UNAVAILABLE.has(outcome.error.reason)) setState({ status: "unavailable" });
          else if (RETRYABLE.has(outcome.error.reason)) setState({ status: "failed", retry });
          else setState({ status: "refused" });
          return;
        case "busy":
          setState({ status: "failed", retry });
          return;
        case "cancelled":
          return;
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, [attempt, execute, request, retry]);

  return state;
}
