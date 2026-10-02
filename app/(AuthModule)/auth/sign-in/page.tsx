import { getTranslations } from "next-intl/server";
import { requireGuest } from "@/app/(AuthModule)/_/guards";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { AuthFooter } from "@/app/(AuthModule)/_/components/layout/AuthFooter";
import { SignInForm } from "@/app/(AuthModule)/_/components/signIn/SignInForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export default async function SignInPage() {
  await requireGuest();
  const t = await getTranslations("auth.pages.signIn");

  return (
    <>
      <AuthHeading title={t("title")}>{t("description")}</AuthHeading>
      <SignInForm />
      <AuthFooter href={authRoutes.signUp.href} label={t("createAccount")}>
        {t("newHere")}
      </AuthFooter>
    </>
  );
}
