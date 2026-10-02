"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { useDisplayNameForm } from "@/app/(AuthModule)/_/hooks/settings/form/useDisplayNameForm";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";

export function DisplayNameForm({
  name,
  onCancel,
  onSettled,
}: {
  name: string;
  onCancel: () => void;
  onSettled: (feedback: Feedback) => void;
}) {
  const t = useTranslations("auth.settings.profile.form");
  const tCommon = useTranslations("auth.settings.common");
  const { form, onSubmit, reset, unchanged, pending } = useDisplayNameForm({
    name,
    onSettled: (feedback) => {
      onSettled(feedback);
      if (feedback.tone !== "error") onCancel();
    },
  });

  return (
    <form noValidate aria-label={t("label")} onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FormInput control={form.control} name="name" label={t("name")} autoComplete="name" maxLength={100} autoFocus disabled={pending} />
        <FieldDescription>{t("hint")}</FieldDescription>
      </FieldGroup>
      <div className="ui:flex ui:flex-wrap ui:justify-end ui:gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { reset(); onCancel(); }}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={unchanged || pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
