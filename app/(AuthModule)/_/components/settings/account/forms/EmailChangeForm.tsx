"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { useEmailChangeForm } from "@/app/(AuthModule)/_/hooks/settings/form/useEmailChangeForm";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";

type ChangeFormTranslator = ReturnType<typeof useTranslations<"auth.settings.email.changeForm">>;

function submitLabel(t: ChangeFormTranslator, pending: boolean, replacing: boolean): string {
  if (pending) return t("sending");
  return replacing ? t("startOver") : t("continue");
}

/** Verified address: read-only current email plus the current password. */
export function EmailChangeForm({
  email,
  replacing,
  onCancel,
  onSettled,
}: {
  email: string;
  replacing: boolean;
  onCancel: () => void;
  onSettled: (feedback: Feedback) => void;
}) {
  const t = useTranslations("auth.settings.email.changeForm");
  const tCommon = useTranslations("auth.settings.common");
  const { form, onSubmit, pending } = useEmailChangeForm({
    email,
    replacing,
    onSettled: (feedback) => {
      onSettled(feedback);
      onCancel();
    },
  });

  return (
    <form noValidate aria-label={t("label")} onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <Field>
          <FieldLabel htmlFor="current-email">{t("currentEmail")}</FieldLabel>
          <Input id="current-email" value={email} readOnly className="ui:h-11" />
          <FieldDescription>
            {t("hint")} {replacing && t("replacingHint")}
          </FieldDescription>
        </Field>
        <FormInput
          control={form.control}
          name="currentPassword"
          label={tCommon("currentPassword")}
          type="password"
          autoComplete="current-password"
          maxLength={128}
          disabled={pending}
        />
      </FieldGroup>
      <div className="ui:flex ui:flex-wrap ui:justify-end ui:gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel(t, pending, replacing)}
        </Button>
      </div>
    </form>
  );
}
