"use client";

import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { useEmailChangeForm } from "@/app/(AuthModule)/_/hooks/settings/form/useEmailChangeForm";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";

/** Verified address: read-only current email plus the current password. */
function submitLabel(pending: boolean, replacing: boolean): string {
  if (pending) return "Sending…";
  return replacing ? "Start over" : "Continue";
}

export function EmailChangeForm({
  email,
  replacing,
  onCancel,
  onSettled,
}: {
  email: string;
  replacing: boolean;
  onCancel: () => void;
  onSettled: (feedback: Feedback) => void;
}) {
  const { form, onSubmit, pending } = useEmailChangeForm({
    email,
    replacing,
    onSettled: (feedback) => {
      onSettled(feedback);
      onCancel();
    },
  });

  return (
    <form noValidate aria-label="Change email address" onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <Field>
          <FieldLabel htmlFor="current-email">Current email address</FieldLabel>
          <Input id="current-email" value={email} readOnly className="ui:h-11" />
          <FieldDescription>
            A confirmation link is sent here first. After confirming it, you choose the new address in this
            section, and the new mailbox confirms as well. {replacing && "The request currently in progress is cancelled."}
          </FieldDescription>
        </Field>
        <FormInput
          control={form.control}
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          disabled={pending}
        />
      </FieldGroup>
      <div className="ui:flex ui:flex-wrap ui:justify-end ui:gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel(pending, replacing)}
        </Button>
      </div>
    </form>
  );
}
