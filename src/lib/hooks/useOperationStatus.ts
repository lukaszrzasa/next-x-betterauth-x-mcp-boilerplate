"use client";

import { useMemo, useReducer } from "react";

export type OperationStatus<T, E> = {
  pending: boolean;
  result: T | null;
  error: E | null;
};

type OperationEvent<T, E> =
  | { type: "started" }
  | { type: "succeeded"; result: T }
  | { type: "failed"; error: E }
  | { type: "reset" };

const idle = { pending: false, result: null, error: null };

function reducer<T, E>(
  state: OperationStatus<T, E>,
  event: OperationEvent<T, E>,
): OperationStatus<T, E> {
  switch (event.type) {
    case "started":
      return { pending: true, result: null, error: null };
    case "succeeded":
      return { pending: false, result: event.result, error: null };
    case "failed":
      return { pending: false, result: null, error: event.error };
    case "reset":
      return idle;
  }
}

/** Pending / result / error for one async operation, driven by methods instead of individual setState calls. */
export function useOperationStatus<T = void, E = string>(
  initial: Partial<OperationStatus<T, E>> = {},
) {
  const [state, dispatch] = useReducer(reducer<T, E>, {
    ...idle,
    ...initial,
  });

  const methods = useMemo(() => {
    const start = () => dispatch({ type: "started" });
    const succeed = (result: T) => dispatch({ type: "succeeded", result });
    const fail = (error: E) => dispatch({ type: "failed", error });
    const reset = () => dispatch({ type: "reset" });

    return { start, succeed, fail, reset };
  }, []);

  return { ...state, ...methods };
}
