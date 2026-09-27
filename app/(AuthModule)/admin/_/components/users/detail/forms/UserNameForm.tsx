"use client";

import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import type { Feedback } from "@/app/(AuthModule)/admin/_/hooks/feedback";
import { useUserNameForm } from "@/app/(AuthModule)/admin/_/hooks/form/useUserNameForm";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";

export function UserNameForm({
  user,
  onCancel,
  onSettled,
}: {
  user: UserDetail;
  onCancel: () => void;
  onSettled: (feedback: Feedback) => void;
}) {
  const { form, onSubmit, reset, unchanged, pending } = useUserNameForm({ user, onSettled });

  return (
    <form noValidate aria-label="Edit name" onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="name"
          label="Name"
          autoComplete="off"
          maxLength={100}
          autoFocus
          disabled={pending}
        />
      </FieldGroup>
      <div className="ui:flex ui:flex-wrap ui:justify-end ui:gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            reset();
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={unchanged || pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}
