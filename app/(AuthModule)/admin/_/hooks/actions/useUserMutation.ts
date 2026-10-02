"use client";

import { useCallback } from "react";
import { useAction, type ActionOutcome } from "@/src/lib/actions";
import type { ServerAction } from "@/src/lib/auth/builders/adapters";
import { useSessionRedirect } from "@/app/(AuthModule)/_/hooks/useSessionRedirect";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import type { UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { feedbackFor, type Feedback, type MutationKind } from "@/app/(AuthModule)/admin/_/hooks/feedback";
import { useAccountRefresh } from "@/app/(AuthModule)/admin/_/hooks/useAccountRefresh";
import { useCatalog } from "@/src/lib/i18n/useCatalog";

export type UserMutationOptions = {
  /** Receives the outcome's feedback; busy and cancelled produce none. */
  onSettled: (feedback: Feedback) => void;
};

/**
 * What every one-click user mutation shares: the `useAction` runtime (which
 * owns step-up prompting, the verification queue and duplicate-submit
 * protection), turning the outcome into feedback, refreshing the page after a
 * change so every section shows authoritative data, and routing root to
 * sign-in when they revoked their own sessions. Each concrete hook in this
 * directory binds one action to one kind of feedback.
 */
export function useUserMutation<I>(
  kind: MutationKind,
  action: ServerAction<I, UserMutationOutcome>,
  { onSettled }: UserMutationOptions,
) {
  const t = useCatalog();
  const refresh = useAccountRefresh();
  const redirect = useSessionRedirect();
  // Feedback is presented by the section; the shared alert stays quiet.
  const { execute, isPending } = useAction<I, UserMutationOutcome>(action, { onError: () => true });

  const run = useCallback(
    async (input: I): Promise<ActionOutcome<UserMutationOutcome>> => {
      const result = await execute(input);
      const feedback = feedbackFor(t, kind, result);
      if (!feedback) return result;

      if (result.status === "success" && result.data.status === "completed" && result.data.selfSignedOut) {
        redirect(authRoutes.signIn.href);
        return result;
      }

      onSettled(feedback);
      const changed = result.status === "success" && result.data.status !== "unchanged";
      const vanished = result.status === "error" && result.error.reason === "NOT_FOUND";
      if (changed || vanished) refresh();
      return result;
    },
    [execute, kind, onSettled, redirect, refresh, t],
  );

  return { run, pending: isPending };
}
