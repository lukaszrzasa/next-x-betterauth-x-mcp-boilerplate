"use client";

import { useTranslations } from "next-intl";
import { authClient } from "@/src/lib/auth/client";
import { enrollmentPasswordSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";

/** What Better Auth hands back once a TOTP authenticator has been enabled. */
export type AuthenticatorSetup = {
  totpURI: string;
  backupCodes: string[];
};

/** Confirms the password, then asks Better Auth for a fresh TOTP secret to enroll. */
export function useEnrollmentPasswordStep(
  onStarted: (setup: AuthenticatorSetup) => void,
) {
  const t = useTranslations("auth.client");
  const { form, createSubmitHandler } = useSchemaForm(enrollmentPasswordSchema);

  const onSubmit = createSubmitHandler(async ({ password }) => {
    const startFailedMessage = t("startSetupFailed");
    const data = unwrapAuthResult(
      await authClient.twoFactor.enable({ password, method: "totp" }),
      startFailedMessage,
    );

    // The response is a union keyed by `method`; only the TOTP shape carries a secret.
    if (data?.method !== "totp") {
      throw new Error(startFailedMessage);
    }

    onStarted({ totpURI: data.totpURI, backupCodes: data.backupCodes });
  });

  return { form, onSubmit };
}
