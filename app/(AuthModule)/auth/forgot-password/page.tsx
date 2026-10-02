import { getTranslations } from "next-intl/server";
import { requireGuest } from "@/app/(AuthModule)/_/guards";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { AuthFooter } from "@/app/(AuthModule)/_/components/layout/AuthFooter";
import { ForgotPasswordForm } from "@/app/(AuthModule)/_/components/passwordReset/ForgotPasswordForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export default async function ForgotPasswordPage() {
  await requireGuest();
  const t = await getTranslations("auth.pages.forgotPassword");

  return (
    <>
      <AuthHeading title={t("title")}>{t("description")}</AuthHeading>
      <ForgotPasswordForm />
      <AuthFooter href={authRoutes.signIn.href} label={t("backToSignIn")} />
    </>
  );
}
