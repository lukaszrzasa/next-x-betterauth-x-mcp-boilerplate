import { requireGuest } from "../../_/guards";
import { AuthHeading, AuthFooter } from "../../_/components/layout/AuthHeading";
import { SignUpForm } from "../../_/components/signUp/SignUpForm";

export default async function SignUpPage() {
  await requireGuest();

  return (
    <>
      <AuthHeading title="Create your account">
        Enter your details to create your account.
      </AuthHeading>
      <SignUpForm />
      <AuthFooter href="/auth/sign-in" label="Sign in">
        Already have an account?
      </AuthFooter>
    </>
  );
}
