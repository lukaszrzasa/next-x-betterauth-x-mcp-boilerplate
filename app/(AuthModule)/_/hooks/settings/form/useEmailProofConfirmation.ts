"use client";

import { useState } from "react";
import { useAction } from "@/src/lib/actions";
import { confirmEmailProofAction } from "@/app/(AuthModule)/_/actions";
import { describeProofOutcome, describeSettingsFailure, type Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/**
 * The public confirmation page's explicit submit. Nothing runs on mount or
 * on navigation; the token stays in memory until the person confirms, and
 * is dropped from the address bar once the result is terminal.
 */
export function useEmailProofConfirmation(token: string) {
  const [result, setResult] = useState<Feedback | null>(null);
  const { execute, isPending } = useAction(confirmEmailProofAction, { onError: () => true });

  async function confirmProof() {
    const outcome = await execute({ token });
    if (outcome.status === "success") {
      setResult(describeProofOutcome(outcome.data));
      window.history.replaceState(null, "", authRoutes.emailChangeConfirmation.href);
    } else if (outcome.status === "error") {
      setResult(describeSettingsFailure(outcome.error));
    }
  }

  return { confirmProof, pending: isPending, result };
}
