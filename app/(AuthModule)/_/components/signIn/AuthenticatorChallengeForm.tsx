"use client";

import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useAuthenticatorChallengeForm } from "../../hooks/form/useAuthenticatorChallengeForm";

export function AuthenticatorChallengeForm() {
  const { form, onSubmit } = useAuthenticatorChallengeForm();
  const pending = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FieldDescription>
          One more step: enter the six-digit code from your authenticator app.
        </FieldDescription>
        <FormInput
          control={form.control}
          name="code"
          label="Authenticator code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          autoFocus
        />
        <Button type="submit" className="ui:h-11" disabled={pending}>
          {pending ? "Verifying…" : "Verify and sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
