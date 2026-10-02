"use client";

import QRCode from "react-qr-code";
import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useEnrollmentVerifyStep } from "@/app/(AuthModule)/_/hooks/form/useEnrollmentVerifyStep";

export function EnrollmentVerifyStep({
  totpURI,
  onVerified,
}: {
  totpURI: string;
  onVerified: () => void;
}) {
  const t = useTranslations("auth.enrollment.verify");
  const { form, onSubmit } = useEnrollmentVerifyStep(onVerified);
  const pending = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>{t("description")}</FieldDescription>
        <Card>
          <CardContent className="ui:flex ui:justify-center">
            <QRCode
              value={totpURI}
              size={190}
              title={t("qrTitle")}
            />
          </CardContent>
        </Card>
        <FormInput
          control={form.control}
          name="code"
          label={t("codeLabel")}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
        />
        <Button type="submit" className="ui:h-11" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
