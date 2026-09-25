"use client";

import { useState } from "react";
import { authClient } from "@/src/lib/auth/client";
import { resetPasswordSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export function useResetPasswordForm(token: string) {
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const { form, createSubmitHandler } = useSchemaForm(resetPasswordSchema);

  const onSubmit = createSubmitHandler(async ({ password }) => {
    unwrapAuthResult(
      await authClient.resetPassword({ newPassword: password, token }),
      "This reset link is invalid or expired.",
    );

    setPasswordUpdated(true);
    // The token is single-use; drop it from the address bar so a refresh cannot resubmit it.
    window.history.replaceState(null, "", authRoutes.resetPassword.href);
  });

  return { form, onSubmit, passwordUpdated };
}
