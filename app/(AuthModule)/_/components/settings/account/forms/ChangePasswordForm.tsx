"use client";

import { Controller } from "react-hook-form";
import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { Label } from "@/src/components/ui/label";
import { useChangePasswordForm } from "@/app/(AuthModule)/_/hooks/settings/form/useChangePasswordForm";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";

/** Current, new and confirm password, plus the default-on other-device sign-out. */
export function ChangePasswordForm({ onCancel, onSettled }: { onCancel: () => void; onSettled: (feedback: Feedback) => void }) {
  const { form, onSubmit, pending } = useChangePasswordForm({
    onSettled: (feedback) => {
      onSettled(feedback);
      if (feedback.tone !== "error") onCancel();
    },
  });

  return (
    <form noValidate aria-label="Change password" onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          disabled={pending}
        />
        <FormInput
          control={form.control}
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          disabled={pending}
        />
        <FormInput
          control={form.control}
          name="confirmNewPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          disabled={pending}
        />
        <FieldDescription>Between 8 and 128 characters; a password manager is welcome.</FieldDescription>
        <Controller
          control={form.control}
          name="revokeOtherSessions"
          render={({ field }) => (
            <div className="ui:flex ui:items-start ui:gap-3">
              <Checkbox
                id="revoke-other-sessions"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                disabled={pending}
              />
              <Label htmlFor="revoke-other-sessions" className="ui:leading-relaxed">
                Sign out other devices (recommended)
              </Label>
            </div>
          )}
        />
      </FieldGroup>
      <div className="ui:flex ui:flex-wrap ui:justify-end ui:gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { form.reset(); onCancel(); }}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
