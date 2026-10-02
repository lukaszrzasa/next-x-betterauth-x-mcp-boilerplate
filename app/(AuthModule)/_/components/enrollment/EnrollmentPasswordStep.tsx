"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import {
  useEnrollmentPasswordStep,
  type AuthenticatorSetup,
} from "@/app/(AuthModule)/_/hooks/form/useEnrollmentPasswordStep";

export function EnrollmentPasswordStep({
  onStarted,
}: {
  onStarted: (setup: AuthenticatorSetup) => void;
}) {
  const t = useTranslations("auth.enrollment.password");
  const { form, onSubmit } = useEnrollmentPasswordStep(onStarted);
  const pending = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="password"
          label={t("label")}
          type="password"
          autoComplete="current-password"
        />
        <Button type="submit" className="ui:h-11" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
