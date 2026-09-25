"use client";

import { authClient } from "@/src/lib/auth/client";
import { recoveryChallengeSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "@/app/(AuthModule)/_/hooks/useSessionRedirect";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/** Completes sign-in with one of the single-use recovery codes. */
export function useRecoveryChallengeForm() {
  const redirect = useSessionRedirect();
  const { form, createSubmitHandler } = useSchemaForm(recoveryChallengeSchema);

  const onSubmit = createSubmitHandler(async ({ code }) => {
    unwrapAuthResult(
      await authClient.twoFactor.verifyBackupCode({ code, trustDevice: false }),
      "Unable to verify this code.",
    );
    redirect(authRoutes.panel.href);
  });

  return { form, onSubmit };
}
