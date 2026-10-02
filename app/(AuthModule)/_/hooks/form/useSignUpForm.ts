"use client";

import { useTranslations } from "next-intl";
import { authClient } from "@/src/lib/auth/client";
import { signUpSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "@/app/(AuthModule)/_/hooks/useSessionRedirect";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export function useSignUpForm() {
  const t = useTranslations("auth.client");
  const redirect = useSessionRedirect();
  const { form, createSubmitHandler } = useSchemaForm(signUpSchema);

  const onSubmit = createSubmitHandler(async ({ name, email, password }) => {
    unwrapAuthResult(
      await authClient.signUp.email({ name, email, password }),
      t("signUpFailed"),
    );

    redirect(authRoutes.panel.href);
  });

  return { form, onSubmit };
}
