import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
  const [{ token, error }, t] = await Promise.all([searchParams, getTranslations("auth.pages.resetPassword")]);

  if (typeof token !== "string" || error) {
    return (
      <>
        <AuthHeading title={t("unavailableTitle")}>{t("unavailableDescription")}</AuthHeading>
        <Button asChild>
          <Link href={authRoutes.forgotPassword.href}>{t("requestNewLink")}</Link>
        </Button>
        <AuthFooter href={authRoutes.signIn.href} label={t("backToSignIn")} />
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t("title")}>{t("description")}</AuthHeading>
      <ResetPasswordForm token={token} />
      <AuthFooter href={authRoutes.signIn.href} label={t("backToSignIn")} />
    </>
  );
}
