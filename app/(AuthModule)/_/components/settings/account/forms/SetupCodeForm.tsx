"use client";

import QRCode from "react-qr-code";
import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { formatUtcDateTime } from "@/src/lib/date/format";
import { useSetupCodeForm } from "@/app/(AuthModule)/_/hooks/settings/form/useSetupCodeForm";
import type { RecoveryCodesIssued, SetupStarted } from "@/app/(AuthModule)/_/types/settings";

/**
 * QR code, manual key and the first code of the new authenticator. The
 * setup material is only ever rendered here, inside the disposable flow.
 */
function submitLabel(pending: boolean, kind: SetupStarted["kind"]): string {
  if (pending) return "Verifying…";
  return kind === "replace" ? "Replace authenticator" : "Activate authenticator";
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
  const { form, onSubmit, pending } = useSetupCodeForm({ kind: setup.kind, requestId: setup.requestId, onCompleted, onClosed });

  return (
    <form noValidate aria-label="Confirm new authenticator" onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>
          Scan this code with your authenticator app, then enter the six-digit code it shows for the{" "}
          {setup.kind === "replace" ? "new entry" : "app"}.
          {setup.kind === "replace" && " A code from your current authenticator does not complete this step."}
        </FieldDescription>
        <Card>
          <CardContent className="ui:flex ui:flex-col ui:items-center ui:gap-4">
            <div className="ui:rounded-md ui:bg-white ui:p-2">
              <QRCode value={setup.totpUri} size={180} title="Scan to set up your authenticator" />
            </div>
            <p className="ui:text-center ui:text-xs ui:text-muted-foreground">
              Cannot scan? Enter this key manually:{" "}
              <code className="ui:break-all ui:select-all ui:text-foreground">{setup.manualKey}</code>
            </p>
          </CardContent>
        </Card>
        <FormInput
          control={form.control}
          name="code"
          label="Code from the new authenticator"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          disabled={pending}
        />
        <FieldDescription>This setup expires at {formatUtcDateTime(setup.expiresAt)}.</FieldDescription>
      </FieldGroup>
      <div className="ui:flex ui:flex-wrap ui:justify-end ui:gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancel setup
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel(pending, setup.kind)}
        </Button>
      </div>
    </form>
  );
}
