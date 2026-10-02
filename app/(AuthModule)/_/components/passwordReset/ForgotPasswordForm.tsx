"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useForgotPasswordForm } from "@/app/(AuthModule)/_/hooks/form/useForgotPasswordForm";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.passwordReset.forgot");
  const { form, onSubmit, resetLinkSent } = useForgotPasswordForm();

  if (resetLinkSent) {
    return (
      <Alert>
        <AlertTitle>{t("inboxTitle")}</AlertTitle>
        <AlertDescription>{t("inboxDescription")}</AlertDescription>
      </Alert>
    );
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
        <Button
          type="submit"
          className="ui:h-11"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
