"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useSignInForm } from "@/app/(AuthModule)/_/hooks/form/useSignInForm";
import { TwoFactorForm } from "./TwoFactorForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export function SignInForm() {
  const t = useTranslations("auth.signIn");
  const { form, onSubmit, twoFactorRequired, restartSignIn } = useSignInForm();

  if (twoFactorRequired) {
    return <TwoFactorForm onRestart={restartSignIn} />;
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="email"
          label={t("email")}
          type="email"
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
        />
        <FormInput
          control={form.control}
          name="password"
          label={t("password")}
          type="password"
          placeholder={t("passwordPlaceholder")}
          autoComplete="current-password"
          aside={
            <Button
              variant="link"
              asChild
              className="ui:h-auto ui:p-0 ui:text-xs"
            >
              <Link href={authRoutes.forgotPassword.href}>{t("forgotPassword")}</Link>
            </Button>
          }
        />
        <Button
          type="submit"
          className="ui:h-11"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? t("submitting") : t("submit")}
          <ArrowRight />
        </Button>
      </FieldGroup>
    </form>
  );
}
