"use client";

import { FormError } from "@/src/components/forms/FormError";
import { FormInput } from "@/src/components/forms/FormInput";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { useAuthenticatorSetupForm } from "@/app/(AuthModule)/_/hooks/settings/form/useAuthenticatorSetupForm";
import type { SetupStarted } from "@/app/(AuthModule)/_/types/settings";

/** The password step of a setup or replacement. */
export function AuthenticatorSetupForm({
  kind,
  onStarted,
  onCancel,
}: {
  kind: "enroll" | "replace";
  onStarted: (setup: SetupStarted) => void;
  onCancel: () => void;
}) {
  const { form, onSubmit, pending } = useAuthenticatorSetupForm({ kind, onStarted });

  return (
    <form noValidate aria-label={kind === "enroll" ? "Set up authenticator" : "Replace authenticator"} onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-4">
      <FieldGroup className="ui:gap-4">
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>
          {kind === "enroll"
            ? "Confirm your password, then scan the code with an authenticator app. Nothing changes until you enter its first code."
            : "Confirm your password; you will also be asked for a code from your current authenticator. The current one keeps working until the new one is proven."}
        </FieldDescription>
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
          {pending ? "Preparing…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
