"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useRecoveryChallengeForm } from "@/app/(AuthModule)/_/hooks/form/useRecoveryChallengeForm";

export function RecoveryChallengeForm() {
  const t = useTranslations("auth.signIn");
  const { form, onSubmit } = useRecoveryChallengeForm();
  const pending = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>{t("recovery.description")}</FieldDescription>
        <FormInput
          control={form.control}
          name="code"
          label={t("recovery.codeLabel")}
          autoComplete="one-time-code"
          placeholder="xxxxx-xxxxx"
          autoFocus
        />
        <Button type="submit" className="ui:h-11" disabled={pending}>
          {pending ? t("verifying") : t("verify")}
        </Button>
      </FieldGroup>
    </form>
  );
}
