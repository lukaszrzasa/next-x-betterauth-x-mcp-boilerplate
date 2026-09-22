"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { sendStepUpEmail } from "../auth/stepUpActions";
import { createActionRuntime } from "./actionRuntime";
import {
  presentVerification,
  VerificationModalRoot,
} from "./VerificationModal";
import type { ActionFailure, ErrorHandler } from "./types";

const ActionContext = createContext<{
  runtime: ReturnType<typeof createActionRuntime>;
  reportError: (error: ActionFailure) => void;
} | null>(null);

/** Mount once, above components using useAction. Callbacks belong in a client wrapper. */
export function ActionProvider({
  children,
  onError,
}: {
  children: ReactNode;
  onError?: ErrorHandler;
}) {
  const parent = useContext(ActionContext);
  const [runtime] = useState(() =>
    createActionRuntime({
      present: presentVerification,
      sendEmail: sendStepUpEmail,
    }),
  );
  const [error, setError] = useState<ActionFailure | null>(null);
  const value = useMemo(
    () => ({
      runtime,
      reportError: (failure: ActionFailure) => {
        if (onError?.(failure) !== true) setError(failure);
      },
    }),
    [runtime, onError],
  );
  if (parent)
    throw new Error("Mount ActionProvider only once at the application root.");

  return (
    <ActionContext.Provider value={value}>
      {children}
      <VerificationModalRoot />
      {error && (
        <div role="alert">
          <p>{error.message}</p>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
    </ActionContext.Provider>
  );
}

export function useActionContext() {
  const context = useContext(ActionContext);
  if (!context) throw new Error("useAction requires ActionProvider.");
  return context;
}
