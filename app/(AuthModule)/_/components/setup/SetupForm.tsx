"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useSetupForm } from "@/app/(AuthModule)/_/hooks/form/useSetupForm";
import { authRoutes } from "@/src/lib/auth/routes";

export function SetupForm() {
  const { form, onSubmit, rootAdminCreated } = useSetupForm();
  const pending = form.formState.isSubmitting;

  if (rootAdminCreated) {
    return (
      <FieldGroup>
        <Alert>
          <AlertTitle>Administrator created</AlertTitle>
          <AlertDescription>
            Sign in to finish authenticator setup before accessing your account.
          </AlertDescription>
        </Alert>
        <Button asChild className="ui:h-11">
          <Link href={authRoutes.signIn}>Continue to sign in</Link>
        </Button>
      </FieldGroup>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="name"
          label="Full name"
          autoComplete="name"
        />
        <FormInput
          control={form.control}
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
        />
        <FormInput
          control={form.control}
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
        />
        <FormInput
          control={form.control}
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
        />
        <Button type="submit" className="ui:h-11" disabled={pending}>
          {pending ? "Creating administrator…" : "Create administrator"}
        </Button>
      </FieldGroup>
    </form>
  );
}
