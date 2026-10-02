"use client";

import { useTranslations } from "next-intl";
import { authClient } from "@/src/lib/auth/client";
import { authenticatorChallengeSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "@/app/(AuthModule)/_/hooks/useSessionRedirect";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/** Completes sign-in with a six-digit code from the authenticator app. */
export function useAuthenticatorChallengeForm() {
  const t = useTranslations("auth.client");
  const redirect = useSessionRedirect();
  const { form, createSubmitHandler } = useSchemaForm(
    authenticatorChallengeSchema,
  );

  const onSubmit = createSubmitHandler(async ({ code }) => {
    unwrapAuthResult(
      await authClient.twoFactor.verifyTotp({ code, trustDevice: false }),
      t("verifyCodeFailed"),
    );
    redirect(authRoutes.panel.href);
  });

  return { form, onSubmit };
}
