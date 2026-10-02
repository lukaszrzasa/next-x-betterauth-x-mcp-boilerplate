"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useSignUpForm } from "@/app/(AuthModule)/_/hooks/form/useSignUpForm";

export function SignUpForm() {
  const t = useTranslations("auth.signUp");
  const { form, onSubmit } = useSignUpForm();

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="name"
          label={t("name")}
          placeholder={t("namePlaceholder")}
          autoComplete="name"
        />
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
          autoComplete="new-password"
        />
        <FormInput
          control={form.control}
          name="confirmPassword"
          label={t("confirmPassword")}
          type="password"
          placeholder={t("confirmPasswordPlaceholder")}
          autoComplete="new-password"
        />
        <FieldDescription>{t("note")}</FieldDescription>
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
