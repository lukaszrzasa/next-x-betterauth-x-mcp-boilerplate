"use client";

import { useState } from "react";
import { authClient } from "@/src/lib/auth/client";
import { forgotPasswordSchema } from "../../schema";
import { unwrapAuthResult } from "../../utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";

export function useForgotPasswordForm() {
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const { form, createSubmitHandler } = useSchemaForm(forgotPasswordSchema);

  const onSubmit = createSubmitHandler(async ({ email }) => {
    unwrapAuthResult(
      await authClient.requestPasswordReset({
        email,
        redirectTo: "/auth/reset-password",
      }),
      "Unable to request a reset. Try again later.",
    );

    setResetLinkSent(true);
  });

  return { form, onSubmit, resetLinkSent };
}
