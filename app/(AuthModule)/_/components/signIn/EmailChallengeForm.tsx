"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import {
  useEmailChallengeForm,
  type EmailCodeDelivery,
} from "@/app/(AuthModule)/_/hooks/form/useEmailChallengeForm";

function describeDelivery(t: (key: "sending" | "sent") => string, delivery: EmailCodeDelivery): string {
  switch (delivery.status) {
    case "sending":
      return t("sending");
    case "sent":
      return t("sent");
    case "failed":
      return delivery.message;
  }
}

export function EmailChallengeForm({
  autoRequest,
  onRequested,
}: {
  /** Request a code on mount; false when one was already sent this sign-in. */
  autoRequest: boolean;
  onRequested: () => void;
}) {
  const t = useTranslations("auth.signIn");
  const { form, onSubmit, delivery, resendCode } = useEmailChallengeForm({
    autoRequest,
    onRequested,
  });
  const pending = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>
          {describeDelivery((key) => t(`emailChallenge.${key}`), delivery)}
        </FieldDescription>
        <FormInput
          control={form.control}
          name="code"
          label={t("emailChallenge.codeLabel")}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          autoFocus
        />
        <Button type="submit" className="ui:h-11" disabled={pending}>
          {pending ? t("verifying") : t("verify")}
        </Button>
        <Button
          type="button"
          variant="link"
          disabled={delivery.status === "sending"}
          onClick={() => void resendCode()}
        >
          {t("emailChallenge.resend")}
        </Button>
      </FieldGroup>
    </form>
  );
}
