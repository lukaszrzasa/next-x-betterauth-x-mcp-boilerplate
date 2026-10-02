"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/src/lib/auth/client";
import { forgotPasswordSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export function useForgotPasswordForm() {
  const t = useTranslations("auth.client");
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const { form, createSubmitHandler } = useSchemaForm(forgotPasswordSchema);

  const onSubmit = createSubmitHandler(async ({ email }) => {
    unwrapAuthResult(
      await authClient.requestPasswordReset({
        email,
        redirectTo: authRoutes.resetPassword.href,
      }),
      t("resetRequestFailed"),
    );

    setResetLinkSent(true);
  });

  return { form, onSubmit, resetLinkSent };
}
