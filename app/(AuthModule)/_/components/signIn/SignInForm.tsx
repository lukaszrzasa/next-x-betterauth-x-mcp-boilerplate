"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useSignInForm } from "../../hooks/form/useSignInForm";
import { TwoFactorForm } from "./TwoFactorForm";

export function SignInForm() {
  const { form, onSubmit, twoFactorRequired, restartSignIn } = useSignInForm();

  if (twoFactorRequired) {
    return <TwoFactorForm onRestart={restartSignIn} />;
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
        <FormInput
          control={form.control}
          name="password"
          label="Password"
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          aside={
            <Button
              variant="link"
              asChild
              className="ui:h-auto ui:p-0 ui:text-xs"
            >
              <Link href="/auth/forgot-password">Forgot password?</Link>
            </Button>
          }
        />
        <Button
          type="submit"
          className="ui:h-11"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          <ArrowRight />
        </Button>
      </FieldGroup>
    </form>
  );
}
