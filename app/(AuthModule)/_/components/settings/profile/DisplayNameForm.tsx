"use client";

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
  const { form, onSubmit, reset, unchanged, pending } = useDisplayNameForm({
    name,
    onSettled: (feedback) => {
      onSettled(feedback);
      if (feedback.tone !== "error") onCancel();
    },
  });

  return (
    <form noValidate aria-label="Edit display name" onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FormInput control={form.control} name="name" label="Name" autoComplete="name" maxLength={100} autoFocus disabled={pending} />
        <FieldDescription>Between 1 and 100 characters.</FieldDescription>
      </FieldGroup>
      <div className="ui:flex ui:flex-wrap ui:justify-end ui:gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { reset(); onCancel(); }}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={unchanged || pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}
