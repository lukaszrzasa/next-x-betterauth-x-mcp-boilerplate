"use client";

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
  const { form, onSubmit, pending } = useNewEmailForm({
    requestId,
    onSettled: (feedback) => {
      onSettled(feedback);
      if (feedback.tone !== "error") onCancel();
    },
  });

  return (
    <form noValidate aria-label="Enter new email address" onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="newEmail"
          label="New email address"
          type="email"
          autoComplete="email"
          maxLength={254}
          disabled={pending}
        />
        <FieldDescription>
          A confirmation link is sent to this address. Once chosen it cannot be edited; cancel and start again to
          pick another.
        </FieldDescription>
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
