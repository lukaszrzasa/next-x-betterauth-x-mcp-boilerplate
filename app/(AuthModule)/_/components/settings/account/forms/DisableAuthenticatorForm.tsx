"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { useDisableAuthenticatorForm } from "@/app/(AuthModule)/_/hooks/settings/form/useDisableAuthenticatorForm";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";

export function DisableAuthenticatorForm({ onCancel, onSettled }: { onCancel: () => void; onSettled: (feedback: Feedback) => void }) {
  const t = useTranslations("auth.settings.authenticator.disableForm");
  const tCommon = useTranslations("auth.settings.common");
  const { form, onSubmit, pending } = useDisableAuthenticatorForm({
    onSettled: (feedback) => {
      onSettled(feedback);
      if (feedback.tone !== "error") onCancel();
    },
  });

  return (
    <form noValidate aria-label={t("label")} onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
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
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
