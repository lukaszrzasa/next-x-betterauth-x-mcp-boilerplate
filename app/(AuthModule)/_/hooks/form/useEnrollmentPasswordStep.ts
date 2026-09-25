"use client";

import { authClient } from "@/src/lib/auth/client";
import { enrollmentPasswordSchema } from "../../schema";
import { unwrapAuthResult } from "../../utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";

/** What Better Auth hands back once a TOTP authenticator has been enabled. */
export type AuthenticatorSetup = {
  totpURI: string;
  backupCodes: string[];
};

const startFailedMessage = "Unable to start authenticator setup.";

/** Confirms the password, then asks Better Auth for a fresh TOTP secret to enroll. */
export function useEnrollmentPasswordStep(
  onStarted: (setup: AuthenticatorSetup) => void,
) {
  const { form, createSubmitHandler } = useSchemaForm(enrollmentPasswordSchema);

  const onSubmit = createSubmitHandler(async ({ password }) => {
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
