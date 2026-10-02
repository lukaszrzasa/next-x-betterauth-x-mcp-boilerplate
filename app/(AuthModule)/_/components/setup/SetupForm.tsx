"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useSetupForm } from "@/app/(AuthModule)/_/hooks/form/useSetupForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export function SetupForm() {
  const t = useTranslations("auth.setup");
  const { form, onSubmit, rootAdminCreated } = useSetupForm();
  const pending = form.formState.isSubmitting;

  if (rootAdminCreated) {
    return (
      <FieldGroup>
        <Alert>
          <AlertTitle>{t("createdTitle")}</AlertTitle>
          <AlertDescription>{t("createdDescription")}</AlertDescription>
        </Alert>
        <Button asChild className="ui:h-11">
          <Link href={authRoutes.signIn.href}>{t("continueToSignIn")}</Link>
        </Button>
      </FieldGroup>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="name"
          label={t("name")}
          autoComplete="name"
        />
        <FormInput
          control={form.control}
          name="email"
          label={t("email")}
          type="email"
          autoComplete="email"
        />
        <FormInput
          control={form.control}
          name="password"
          label={t("password")}
          type="password"
          autoComplete="new-password"
        />
        <FormInput
          control={form.control}
          name="confirmPassword"
          label={t("confirmPassword")}
          type="password"
          autoComplete="new-password"
        />
        <Button type="submit" className="ui:h-11" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
