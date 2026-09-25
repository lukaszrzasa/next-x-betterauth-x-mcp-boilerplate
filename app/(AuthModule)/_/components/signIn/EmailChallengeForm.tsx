"use client";

import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import {
  useEmailChallengeForm,
  type EmailCodeDelivery,
} from "@/app/(AuthModule)/_/hooks/form/useEmailChallengeForm";

function describeDelivery(delivery: EmailCodeDelivery): string {
  switch (delivery.status) {
    case "sending":
      return "Sending a code to your email address…";
    case "sent":
      return "We emailed you a six-digit code. Enter it below to finish signing in.";
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
  const { form, onSubmit, delivery, resendCode } = useEmailChallengeForm({
    autoRequest,
    onRequested,
  });
  const pending = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>{describeDelivery(delivery)}</FieldDescription>
        <FormInput
          control={form.control}
          name="code"
          label="Email code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          autoFocus
        />
        <Button type="submit" className="ui:h-11" disabled={pending}>
          {pending ? "Verifying…" : "Verify and sign in"}
        </Button>
        <Button
          type="button"
          variant="link"
          disabled={delivery.status === "sending"}
          onClick={() => void resendCode()}
        >
          Send a new code
        </Button>
      </FieldGroup>
    </form>
  );
}
