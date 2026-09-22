"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useActionContext } from "./ActionProvider";
import type { ActionOptions, ActionOutcome, ServerAction } from "./types";

export function useAction<I, O>(
  action: ServerAction<I, O>,
  options: ActionOptions<O> = {},
) {
  const { runtime, reportError } = useActionContext();
  const { onSuccess, onError } = options;
  const mounted = useRef(true);
  const active = useRef<AbortController | null>(null);
  const [isPending, setPending] = useState(false);
  const [result, setResult] = useState<ActionOutcome<O> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  const execute = useCallback(
    async (input: I): Promise<ActionOutcome<O>> => {
      if (!mounted.current) return { status: "cancelled" };
      if (active.current) return { status: "busy" };
      const controller = new AbortController();
      active.current = controller;
      setPending(true);
      setResult(null);
      try {
        const outcome = await runtime.execute(action, input, controller.signal);
        if (mounted.current && !controller.signal.aborted) {
          setResult(outcome);
          if (outcome.status === "success") onSuccess?.(outcome.data);
          if (
            outcome.status === "error" &&
            onError?.(outcome.error) !== true &&
            mounted.current &&
            !controller.signal.aborted
          )
            reportError(outcome.error);
        }
        return outcome;
      } finally {
        if (active.current === controller) active.current = null;
        if (mounted.current && !controller.signal.aborted) setPending(false);
      }
    },
    [action, onSuccess, onError, runtime, reportError],
  );

  return { execute, isPending, result };
}
