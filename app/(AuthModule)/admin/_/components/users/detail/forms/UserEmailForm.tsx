"use client";

import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import type { Feedback } from "@/app/(AuthModule)/admin/_/hooks/feedback";
import { useUserEmailForm } from "@/app/(AuthModule)/admin/_/hooks/form/useUserEmailForm";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";

export function UserEmailForm({
  user,
  onCancel,
  onSettled,
}: {
  user: UserDetail;
  onCancel: () => void;
  onSettled: (feedback: Feedback) => void;
}) {
  const { form, onSubmit, reset, unchanged, pending } = useUserEmailForm({ user, onSettled });

  return (
    <form
      noValidate
      aria-label="Edit email address"
      onSubmit={onSubmit}
      className="ui:flex ui:flex-col ui:gap-4"
    >
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="email"
          label="Email address"
          type="email"
          autoComplete="off"
          maxLength={254}
          autoFocus
          disabled={pending}
        />
      </FieldGroup>
      <p className="ui:text-xs ui:text-muted-foreground">
        Changing the address marks it unverified, signs the user out everywhere and sends a
        verification email to the new address. Older password-reset links stop working.
      </p>
      <div className="ui:flex ui:flex-wrap ui:gap-2">
        <Button type="submit" size="sm" disabled={unchanged || pending}>
          {pending ? "Saving…" : "Save email"}
        </Button>
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
      </div>
    </form>
  );
}
