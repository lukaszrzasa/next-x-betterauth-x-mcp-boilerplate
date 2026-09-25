import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { requireGuest } from "../../_/guards";
import { AuthHeading, AuthFooter } from "../../_/components/layout/AuthHeading";
import { ResetPasswordForm } from "../../_/components/passwordReset/ResetPasswordForm";

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
          <Link href="/auth/forgot-password">Request a new link</Link>
        </Button>
        <AuthFooter href="/auth/sign-in" label="Back to sign in" />
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Set a new password">
        Choose a new password for your account.
      </AuthHeading>
      <ResetPasswordForm token={token} />
      <AuthFooter href="/auth/sign-in" label="Back to sign in" />
    </>
  );
}
