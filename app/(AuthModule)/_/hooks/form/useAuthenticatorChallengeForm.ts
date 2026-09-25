"use client";

import { authClient } from "@/src/lib/auth/client";
import { authenticatorChallengeSchema } from "../../schema";
import { unwrapAuthResult } from "../../utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "../useSessionRedirect";

/** Completes sign-in with a six-digit code from the authenticator app. */
export function useAuthenticatorChallengeForm() {
  const redirect = useSessionRedirect();
  const { form, createSubmitHandler } = useSchemaForm(
    authenticatorChallengeSchema,
  );

  const onSubmit = createSubmitHandler(async ({ code }) => {
    unwrapAuthResult(
      await authClient.twoFactor.verifyTotp({ code, trustDevice: false }),
      "Unable to verify this code.",
    );
    redirect("/panel");
  });

  return { form, onSubmit };
}
