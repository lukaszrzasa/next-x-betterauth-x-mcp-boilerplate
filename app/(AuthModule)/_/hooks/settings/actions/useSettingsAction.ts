"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCatalog } from "@/src/lib/i18n/useCatalog";
import { useAction, type ActionOutcome } from "@/src/lib/actions";
import type { ServerAction } from "@/src/lib/auth/builders/adapters";
import { useSessionRedirect } from "@/app/(AuthModule)/_/hooks/useSessionRedirect";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";
import { syncFeedbackFor, type Feedback, type SyncKind } from "@/app/(AuthModule)/_/hooks/settings/feedback";

export type SettingsActionOptions = {
  /** Receives the outcome's feedback; busy and cancelled produce none. */
  onSettled: (feedback: Feedback) => void;
};

/**
 * What every one-click settings action with a synchronization outcome
 * shares: the `useAction` runtime (step-up prompting, the verification
 * queue, duplicate-submit protection), the outcome turned into feedback,
 * a refresh of the server components after a change, and the sign-in
 * redirect once the actor has signed themselves out everywhere.
 */
export function useSettingsAction<I>(
  kind: SyncKind,
  action: ServerAction<I, SyncOutcome>,
  { onSettled }: SettingsActionOptions,
) {
  const router = useRouter();
  const t = useCatalog();
  const redirect = useSessionRedirect();
  const { execute, isPending } = useAction<I, SyncOutcome>(action, { onError: () => true });

  const run = useCallback(
    async (input: I): Promise<ActionOutcome<SyncOutcome>> => {
      const result = await execute(input);
      const feedback = syncFeedbackFor(t, kind, result);
      if (!feedback) return result;

      if (result.status === "success" && result.data.status === "completed" && result.data.selfSignedOut) {
        redirect(authRoutes.signIn.href);
        return result;
      }

      onSettled(feedback);
      const changed = result.status === "success" && result.data.status !== "unchanged";
      const stale = result.status === "error" && (result.error.reason === "NOT_FOUND" || result.error.reason === "CONFLICT");
      if (changed || stale) router.refresh();
      return result;
    },
    [execute, kind, onSettled, redirect, router, t],
  );

  return { run, pending: isPending };
}
