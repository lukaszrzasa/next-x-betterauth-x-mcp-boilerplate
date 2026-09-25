"use client";

import { useState } from "react";
import { authClient } from "@/src/lib/auth/client";
import { signInSchema } from "../../schema";
import { unwrapAuthResult } from "../../utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "../useSessionRedirect";

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

    redirect("/panel");
  });

  function restartSignIn() {
    setTwoFactorRequired(false);
  }

  return { form, onSubmit, twoFactorRequired, restartSignIn };
}
