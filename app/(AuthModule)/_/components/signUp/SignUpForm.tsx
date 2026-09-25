"use client";

import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { FormInput } from "@/src/components/forms/FormInput";
import { FormError } from "@/src/components/forms/FormError";
import { useSignUpForm } from "../../hooks/form/useSignUpForm";

export function SignUpForm() {
  const { form, onSubmit } = useSignUpForm();

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={form.formState.errors.root?.message} />
        <FormInput
          control={form.control}
          name="name"
          label="Full name"
          placeholder="Your name"
          autoComplete="name"
        />
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
          placeholder="At least 8 characters"
          autoComplete="new-password"
        />
        <FormInput
          control={form.control}
          name="confirmPassword"
          label="Confirm password"
          type="password"
          placeholder="Repeat your password"
          autoComplete="new-password"
        />
        <FieldDescription>
          We’ll send a confirmation link to your email. You can start using your
          account right away.
        </FieldDescription>
        <Button
          type="submit"
          className="ui:h-11"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </FieldGroup>
    </form>
  );
}
