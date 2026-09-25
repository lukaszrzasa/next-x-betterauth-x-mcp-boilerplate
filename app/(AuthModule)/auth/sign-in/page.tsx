import { requireGuest } from "../../_/guards";
import { AuthHeading, AuthFooter } from "../../_/components/layout/AuthHeading";
import { SignInForm } from "../../_/components/signIn/SignInForm";

export default async function SignInPage() {
  await requireGuest();

  return (
    <>
      <AuthHeading title="Welcome back">
        Enter your details to sign in to your account.
      </AuthHeading>
      <SignInForm />
      <AuthFooter href="/auth/sign-up" label="Create an account">
        New here?
      </AuthFooter>
    </>
  );
}
