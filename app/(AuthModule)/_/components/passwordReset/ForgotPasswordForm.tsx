"use client";

import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useForgotPasswordForm } from "../../hooks/form/useForgotPasswordForm";

export function ForgotPasswordForm() {
  const { form, onSubmit, resetLinkSent } = useForgotPasswordForm();

  if (resetLinkSent) {
    return (
      <Alert>
        <AlertTitle>Check your inbox</AlertTitle>
        <AlertDescription>
          If an account matches that email, you’ll receive a password reset link
          shortly.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="email"
          label="Email address"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
        />
        <Button
          type="submit"
          className="ui:h-11"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </FieldGroup>
    </form>
  );
}
