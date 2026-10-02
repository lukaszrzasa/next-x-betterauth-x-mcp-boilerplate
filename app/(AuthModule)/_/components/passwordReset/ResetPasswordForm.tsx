"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useResetPasswordForm } from "@/app/(AuthModule)/_/hooks/form/useResetPasswordForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth.passwordReset.reset");
  const { form, onSubmit, passwordUpdated } = useResetPasswordForm(token);

  if (passwordUpdated) {
    return (
      <Alert>
        <AlertTitle>{t("updatedTitle")}</AlertTitle>
        <AlertDescription>{t("updatedDescription")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="password"
          label={t("newPassword")}
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
        <Button
          type="submit"
          className="ui:h-11"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? t("submitting") : t("submit")}
        </Button>
        {form.formState.errors.root && (
          <Button asChild variant="link">
            <Link href={authRoutes.forgotPassword.href}>{t("requestNewLink")}</Link>
          </Button>
        )}
      </FieldGroup>
    </form>
  );
}
