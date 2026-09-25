import { requireGuest } from "@/app/(AuthModule)/_/guards";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { AuthFooter } from "@/app/(AuthModule)/_/components/layout/AuthFooter";
import { ForgotPasswordForm } from "@/app/(AuthModule)/_/components/passwordReset/ForgotPasswordForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export default async function ForgotPasswordPage() {
  await requireGuest();

  return (
    <>
      <AuthHeading title="Forgot your password?">
        It happens. Enter your email and we’ll send you a link to reset it.
      </AuthHeading>
      <ForgotPasswordForm />
      <AuthFooter href={authRoutes.signIn.href} label="← Back to sign in" />
    </>
  );
}
