"use client";

import { useState } from "react";
import { authClient } from "@/src/lib/auth/client";
import { forgotPasswordSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export function useForgotPasswordForm() {
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const { form, createSubmitHandler } = useSchemaForm(forgotPasswordSchema);

  const onSubmit = createSubmitHandler(async ({ email }) => {
    unwrapAuthResult(
      await authClient.requestPasswordReset({
        email,
        redirectTo: authRoutes.resetPassword.href,
      }),
      "Unable to request a reset. Try again later.",
    );

    setResetLinkSent(true);
  });

  return { form, onSubmit, resetLinkSent };
}
