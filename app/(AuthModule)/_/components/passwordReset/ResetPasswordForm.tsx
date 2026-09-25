"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useResetPasswordForm } from "@/app/(AuthModule)/_/hooks/form/useResetPasswordForm";
import { authRoutes } from "@/src/lib/auth/routes";

export function ResetPasswordForm({ token }: { token: string }) {
  const { form, onSubmit, passwordUpdated } = useResetPasswordForm(token);

  if (passwordUpdated) {
    return (
      <Alert>
        <AlertTitle>Password updated</AlertTitle>
        <AlertDescription>
          Your sessions have been signed out. Sign in with your new password to
          continue.
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
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
        />
        <FormInput
          control={form.control}
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
        />
        <Button
          type="submit"
          className="ui:h-11"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Updating…" : "Reset password"}
        </Button>
        {form.formState.errors.root && (
          <Button asChild variant="link">
            <Link href={authRoutes.forgotPassword}>Request a new reset link</Link>
          </Button>
        )}
      </FieldGroup>
    </form>
  );
}
