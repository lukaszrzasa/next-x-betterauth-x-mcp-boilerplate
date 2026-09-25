"use client";

import { authClient } from "@/src/lib/auth/client";
import { authenticatorChallengeSchema } from "../../schema";
import { unwrapAuthResult } from "../../utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";

/** Proves the scanned authenticator with its first code; Better Auth then marks the account enrolled. */
export function useEnrollmentVerifyStep(onVerified: () => void) {
  const { form, createSubmitHandler } = useSchemaForm(
    authenticatorChallengeSchema,
  );

  const onSubmit = createSubmitHandler(async ({ code }) => {
    unwrapAuthResult(
      await authClient.twoFactor.verifyTotp({ code, trustDevice: false }),
      "Unable to verify the authenticator code.",
    );
    onVerified();
  });

  return { form, onSubmit };
}
