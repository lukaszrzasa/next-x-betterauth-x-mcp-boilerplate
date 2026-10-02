"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { useNewEmailForm } from "@/app/(AuthModule)/_/hooks/settings/form/useNewEmailForm";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";

/** The destination, once the current mailbox agreed; fixed after this submit. */
export function NewEmailForm({
  requestId,
  onCancel,
  onSettled,
}: {
  requestId: string;
  onCancel: () => void;
  onSettled: (feedback: Feedback) => void;
}) {
  const t = useTranslations("auth.settings.email.newEmailForm");
  const tCommon = useTranslations("auth.settings.common");
  const { form, onSubmit, pending } = useNewEmailForm({
    requestId,
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
          name="newEmail"
          label={t("newEmail")}
          type="email"
          autoComplete="email"
          maxLength={254}
          disabled={pending}
        />
        <FieldDescription>{t("hint")}</FieldDescription>
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
