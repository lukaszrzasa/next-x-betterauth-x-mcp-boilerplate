import { requireGuest } from "../../_/guards";
import { AuthHeading, AuthFooter } from "../../_/components/layout/AuthHeading";
import { ForgotPasswordForm } from "../../_/components/passwordReset/ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  await requireGuest();

  return (
    <>
      <AuthHeading title="Forgot your password?">
        It happens. Enter your email and we’ll send you a link to reset it.
      </AuthHeading>
      <ForgotPasswordForm />
      <AuthFooter href="/auth/sign-in" label="← Back to sign in" />
    </>
  );
}
