"use client";

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
  const { form, onSubmit, pending } = useEmailCorrectionForm({
    onSettled: (feedback) => {
      onSettled(feedback);
      onCancel();
    },
  });

  return (
    <form noValidate aria-label="Correct email address" onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>
          Use this when {email} is wrong or unreachable. A confirmation link is sent to the corrected address
          only; nothing is sent to the current one. Confirming it completes the change and signs out every
          session.
        </FieldDescription>
        <FormInput
          control={form.control}
          name="newEmail"
          label="Corrected email address"
          type="email"
          autoComplete="email"
          maxLength={254}
          disabled={pending}
        />
        <FormInput
          control={form.control}
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          disabled={pending}
        />
        {twoFactorEnabled && (
          <FormInput
            control={form.control}
            name="authenticatorCode"
            label="Authenticator code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            disabled={pending}
          />
        )}
      </FieldGroup>
      <div className="ui:flex ui:flex-wrap ui:justify-end ui:gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Send confirmation"}
        </Button>
      </div>
    </form>
  );
}
