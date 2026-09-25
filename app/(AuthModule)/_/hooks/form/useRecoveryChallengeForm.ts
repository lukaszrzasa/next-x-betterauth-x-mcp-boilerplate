"use client";

import { authClient } from "@/src/lib/auth/client";
import { recoveryChallengeSchema } from "../../schema";
import { unwrapAuthResult } from "../../utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "../useSessionRedirect";

/** Completes sign-in with one of the single-use recovery codes. */
export function useRecoveryChallengeForm() {
  const redirect = useSessionRedirect();
  const { form, createSubmitHandler } = useSchemaForm(recoveryChallengeSchema);

  const onSubmit = createSubmitHandler(async ({ code }) => {
    unwrapAuthResult(
      await authClient.twoFactor.verifyBackupCode({ code, trustDevice: false }),
      "Unable to verify this code.",
    );
    redirect("/panel");
  });

  return { form, onSubmit };
}
