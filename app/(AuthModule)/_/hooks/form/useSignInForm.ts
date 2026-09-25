"use client";

import { useState } from "react";
import { authClient } from "@/src/lib/auth/client";
import { signInSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "@/app/(AuthModule)/_/hooks/useSessionRedirect";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export function useSignInForm() {
  const redirect = useSessionRedirect();
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const { form, createSubmitHandler } = useSchemaForm(signInSchema);

  const onSubmit = createSubmitHandler(async (input) => {
    const data = unwrapAuthResult(
      await authClient.signIn.email(input),
      "Unable to sign in.",
    );

    // Enrolled accounts get a challenge instead of a session; the response shape differs.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      form.reset();
      setTwoFactorRequired(true);

      return;
    }

    redirect(authRoutes.panel.href);
  });

  function restartSignIn() {
    setTwoFactorRequired(false);
  }

  return { form, onSubmit, twoFactorRequired, restartSignIn };
}
