"use client";

import { useTranslations } from "next-intl";
import { authClient } from "@/src/lib/auth/client";
import { authenticatorChallengeSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";

/** Proves the scanned authenticator with its first code; Better Auth then marks the account enrolled. */
export function useEnrollmentVerifyStep(onVerified: () => void) {
  const t = useTranslations("auth.client");
  const { form, createSubmitHandler } = useSchemaForm(
    authenticatorChallengeSchema,
  );

  const onSubmit = createSubmitHandler(async ({ code }) => {
    unwrapAuthResult(
      await authClient.twoFactor.verifyTotp({ code, trustDevice: false }),
      t("verifyAuthenticatorFailed"),
    );
    onVerified();
  });

  return { form, onSubmit };
}
