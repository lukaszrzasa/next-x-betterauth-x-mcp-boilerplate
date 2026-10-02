"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useAuthenticatorChallengeForm } from "@/app/(AuthModule)/_/hooks/form/useAuthenticatorChallengeForm";

export function AuthenticatorChallengeForm() {
  const t = useTranslations("auth.signIn");
  const { form, onSubmit } = useAuthenticatorChallengeForm();
  const pending = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>{t("authenticator.description")}</FieldDescription>
        <FormInput
          control={form.control}
          name="code"
          label={t("authenticator.codeLabel")}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          autoFocus
        />
        <Button type="submit" className="ui:h-11" disabled={pending}>
          {pending ? t("verifying") : t("verify")}
        </Button>
      </FieldGroup>
    </form>
  );
}
