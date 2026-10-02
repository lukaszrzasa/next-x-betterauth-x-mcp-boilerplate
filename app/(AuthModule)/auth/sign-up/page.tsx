import { getTranslations } from "next-intl/server";
import { requireGuest } from "@/app/(AuthModule)/_/guards";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { AuthFooter } from "@/app/(AuthModule)/_/components/layout/AuthFooter";
import { SignUpForm } from "@/app/(AuthModule)/_/components/signUp/SignUpForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export default async function SignUpPage() {
  await requireGuest();
  const t = await getTranslations("auth.pages.signUp");

  return (
    <>
      <AuthHeading title={t("title")}>{t("description")}</AuthHeading>
      <SignUpForm />
      <AuthFooter href={authRoutes.signIn.href} label={t("signIn")}>
        {t("haveAccount")}
      </AuthFooter>
    </>
  );
}
