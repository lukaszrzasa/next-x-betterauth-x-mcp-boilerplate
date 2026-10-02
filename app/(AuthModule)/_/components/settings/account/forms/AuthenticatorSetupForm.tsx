"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { useAuthenticatorSetupForm } from "@/app/(AuthModule)/_/hooks/settings/form/useAuthenticatorSetupForm";
import type { SetupStarted } from "@/app/(AuthModule)/_/types/settings";

/** The password step of a setup or replacement. */
export function AuthenticatorSetupForm({
  kind,
  onStarted,
  onCancel,
}: {
  kind: "enroll" | "replace";
  onStarted: (setup: SetupStarted) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("auth.settings.authenticator.setupForm");
  const tCommon = useTranslations("auth.settings.common");
  const { form, onSubmit, pending } = useAuthenticatorSetupForm({ kind, onStarted });

  return (
    <form noValidate aria-label={kind === "enroll" ? t("labelEnroll") : t("labelReplace")} onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>{kind === "enroll" ? t("hintEnroll") : t("hintReplace")}</FieldDescription>
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
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
