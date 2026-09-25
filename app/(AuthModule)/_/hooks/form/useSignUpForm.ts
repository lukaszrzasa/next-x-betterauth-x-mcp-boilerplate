"use client";

import { authClient } from "@/src/lib/auth/client";
import { signUpSchema } from "../../schema";
import { unwrapAuthResult } from "../../utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "../useSessionRedirect";

export function useSignUpForm() {
  const redirect = useSessionRedirect();
  const { form, createSubmitHandler } = useSchemaForm(signUpSchema);

  const onSubmit = createSubmitHandler(async ({ name, email, password }) => {
    unwrapAuthResult(
      await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: "/auth/email-confirmation",
      }),
      "Unable to create your account.",
    );

    redirect("/panel");
  });

  return { form, onSubmit };
}
