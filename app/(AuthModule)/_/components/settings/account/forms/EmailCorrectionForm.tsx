"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { useEmailCorrectionForm } from "@/app/(AuthModule)/_/hooks/settings/form/useEmailCorrectionForm";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";

/** Unverified address: the corrected address, the password and, when enrolled, an authenticator code. */
export function EmailCorrectionForm({
  email,
  twoFactorEnabled,
  onCancel,
  onSettled,
}: {
  email: string;
  twoFactorEnabled: boolean;
  onCancel: () => void;
  onSettled: (feedback: Feedback) => void;
}) {
  const t = useTranslations("auth.settings.email.correctionForm");
  const tCommon = useTranslations("auth.settings.common");
  const { form, onSubmit, pending } = useEmailCorrectionForm({
    onSettled: (feedback) => {
      onSettled(feedback);
      onCancel();
    },
  });

  return (
    <form noValidate aria-label={t("label")} onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>{t("hint", { email })}</FieldDescription>
        <FormInput
          control={form.control}
          name="newEmail"
          label={t("newEmail")}
          type="email"
          autoComplete="email"
          maxLength={254}
          disabled={pending}
        />
        <FormInput
          control={form.control}
          name="currentPassword"
          label={tCommon("currentPassword")}
          type="password"
          autoComplete="current-password"
          maxLength={128}
          disabled={pending}
        />
        {twoFactorEnabled && (
          <FormInput
            control={form.control}
            name="authenticatorCode"
            label={t("authenticatorCode")}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            disabled={pending}
          />
        )}
      </FieldGroup>
      <div className="ui:flex ui:flex-wrap ui:justify-end ui:gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
