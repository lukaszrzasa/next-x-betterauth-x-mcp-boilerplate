import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { requireGuest } from "@/app/(AuthModule)/_/guards";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { AuthFooter } from "@/app/(AuthModule)/_/components/layout/AuthFooter";
import { ResetPasswordForm } from "@/app/(AuthModule)/_/components/passwordReset/ResetPasswordForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  await requireGuest();
  const { token, error } = await searchParams;

  if (typeof token !== "string" || error) {
    return (
      <>
        <AuthHeading title="Reset link unavailable">
          This reset link is missing, invalid, or expired.
        </AuthHeading>
        <Button asChild>
          <Link href={authRoutes.forgotPassword.href}>Request a new link</Link>
        </Button>
        <AuthFooter href={authRoutes.signIn.href} label="Back to sign in" />
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Set a new password">
        Choose a new password for your account.
      </AuthHeading>
      <ResetPasswordForm token={token} />
      <AuthFooter href={authRoutes.signIn.href} label="Back to sign in" />
    </>
  );
}
