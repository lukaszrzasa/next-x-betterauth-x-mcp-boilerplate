"use client";

import { useCallback, useEffect, useRef } from "react";
import { useOperationStatus } from "@/src/lib/hooks/useOperationStatus";
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
  const { pending, result, start, succeed, reset } =
    useOperationStatus<ActionOutcome<O>>();

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
      const live = () => mounted.current && !controller.signal.aborted;
      start();
      try {
        const outcome = await runtime.execute(action, input, controller.signal);
        if (live()) {
          succeed(outcome);
          if (outcome.status === "success") onSuccess?.(outcome.data);
          if (
            outcome.status === "error" &&
            onError?.(outcome.error) !== true &&
            live()
          )
            reportError(outcome.error);
        }
        return outcome;
      } catch (error) {
        if (live()) reset();
        throw error;
      } finally {
        if (active.current === controller) active.current = null;
      }
    },
    [action, onSuccess, onError, runtime, reportError, start, succeed, reset],
  );

  return { execute, isPending: pending, result };
}
