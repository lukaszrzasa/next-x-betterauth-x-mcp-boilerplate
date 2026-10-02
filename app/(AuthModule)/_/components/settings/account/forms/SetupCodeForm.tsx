"use client";

import QRCode from "react-qr-code";
import { useTranslations } from "next-intl";
import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { useSetupCodeForm } from "@/app/(AuthModule)/_/hooks/settings/form/useSetupCodeForm";
import type { RecoveryCodesIssued, SetupStarted } from "@/app/(AuthModule)/_/types/settings";

type CodeFormTranslator = ReturnType<typeof useTranslations<"auth.settings.authenticator.codeForm">>;

/**
 * QR code, manual key and the first code of the new authenticator. The
 * setup material is only ever rendered here, inside the disposable flow.
 */
function submitLabel(t: CodeFormTranslator, pending: boolean, kind: SetupStarted["kind"]): string {
  if (pending) return t("submitting");
  return kind === "replace" ? t("submitReplace") : t("submitEnroll");
}

export function SetupCodeForm({
  setup,
  onCompleted,
  onClosed,
  onCancel,
}: {
  setup: SetupStarted;
  onCompleted: (issued: RecoveryCodesIssued) => void;
  onClosed: (message: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("auth.settings.authenticator.codeForm");
  const { form, onSubmit, pending } = useSetupCodeForm({ kind: setup.kind, requestId: setup.requestId, onCompleted, onClosed });

  return (
    <form noValidate aria-label={t("label")} onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>{setup.kind === "replace" ? t("hintReplace") : t("hintEnroll")}</FieldDescription>
        <Card>
          <CardContent className="ui:flex ui:flex-col ui:items-center ui:gap-4">
            <div className="ui:rounded-md ui:bg-white ui:p-2">
              <QRCode value={setup.totpUri} size={180} title={t("qrTitle")} />
            </div>
            <p className="ui:text-center ui:text-xs ui:text-muted-foreground">
              {t("manualKey")}{" "}
              <code className="ui:break-all ui:select-all ui:text-foreground">{setup.manualKey}</code>
            </p>
          </CardContent>
        </Card>
        <FormInput
          control={form.control}
          name="code"
          label={t("code")}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          disabled={pending}
        />
        <FieldDescription>{t("expiresAt", { expiresAt: new Date(setup.expiresAt) })}</FieldDescription>
      </FieldGroup>
      <div className="ui:flex ui:flex-wrap ui:justify-end ui:gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel(t, pending, setup.kind)}
        </Button>
      </div>
    </form>
  );
}
