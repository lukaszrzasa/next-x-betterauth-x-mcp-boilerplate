"use client";

import { useState } from "react";
import { describeFailure, useAction } from "@/src/lib/actions";
import { completePasswordResetAction } from "@/app/(AuthModule)/_/actions";
import { resetPasswordSchema } from "@/app/(AuthModule)/_/schema";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/**
 * Completes the emailed reset link through the guarded public operation
 * rather than the provider's HTTP endpoint (hidden at the boundary), so the
 * reset shares the account lock with the settings lifecycles. The UI and
 * URL behaviour are unchanged: same fields, same success notice, token
 * dropped from the address bar once it is spent.
 */
export function useResetPasswordForm(token: string) {
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const { form, createSubmitHandler } = useSchemaForm(resetPasswordSchema);
  // Refusals are shown as the form's root error; the shared alert stays quiet.
  const { execute } = useAction(completePasswordResetAction, { onError: () => true });

  const onSubmit = createSubmitHandler(async ({ password }) => {
    const result = await execute({ token, newPassword: password });
    if (result.status === "error") {
      const { title, description } = describeFailure(result.error);
      throw new Error(
        result.error.reason === "FORBIDDEN" || result.error.reason === "INVALID_INPUT"
          ? result.error.message
          : (description ?? title),
      );
    }
    if (result.status !== "success") return;

    setPasswordUpdated(true);
    // The token is single-use; drop it from the address bar so a refresh cannot resubmit it.
    window.history.replaceState(null, "", authRoutes.resetPassword.href);
  });

  return { form, onSubmit, passwordUpdated };
}
