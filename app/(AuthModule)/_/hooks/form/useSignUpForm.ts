"use client";

import { authClient } from "@/src/lib/auth/client";
import { signUpSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "@/app/(AuthModule)/_/hooks/useSessionRedirect";
import { authRoutes } from "@/src/lib/auth/routes";

export function useSignUpForm() {
  const redirect = useSessionRedirect();
  const { form, createSubmitHandler } = useSchemaForm(signUpSchema);

  const onSubmit = createSubmitHandler(async ({ name, email, password }) => {
    unwrapAuthResult(
      await authClient.signUp.email({ name, email, password }),
      "Unable to create your account.",
    );

    redirect(authRoutes.panel);
  });

  return { form, onSubmit };
}
