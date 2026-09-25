"use client";

import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import {
  useEnrollmentPasswordStep,
  type AuthenticatorSetup,
} from "../../hooks/form/useEnrollmentPasswordStep";

export function EnrollmentPasswordStep({
  onStarted,
}: {
  onStarted: (setup: AuthenticatorSetup) => void;
}) {
  const { form, onSubmit } = useEnrollmentPasswordStep(onStarted);
  const pending = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="password"
          label="Confirm your password"
          type="password"
          autoComplete="current-password"
        />
        <Button type="submit" className="ui:h-11" disabled={pending}>
          {pending ? "Preparing…" : "Set up authenticator"}
        </Button>
      </FieldGroup>
    </form>
  );
}
