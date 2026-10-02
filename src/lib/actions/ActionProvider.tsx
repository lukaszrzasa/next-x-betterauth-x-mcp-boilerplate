"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { sendStepUpEmail } from "@/src/lib/auth/stepUpActions";
import { createActionRuntime } from "./actionRuntime";
import { describeFailure } from "./describeFailure";
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
      presentVerification,
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
      {error && <SharedFailure error={error} onDismiss={() => setError(null)} />}
    </ActionContext.Provider>
  );
}

/** The fallback presentation of a failure no caller handled: the catalog's words for its reason. */
function SharedFailure({ error, onDismiss }: { error: ActionFailure; onDismiss: () => void }) {
  const t = useTranslations();
  const { title, description } = describeFailure(t, error);
  return (
    <div role="alert">
      <p>{title}</p>
      {description && <p>{description}</p>}
      <button type="button" onClick={onDismiss}>
        {t("common.actions.dismiss")}
      </button>
    </div>
  );
}

export function useActionContext() {
  const context = useContext(ActionContext);
  if (!context) throw new Error("useAction requires ActionProvider.");
  return context;
}
