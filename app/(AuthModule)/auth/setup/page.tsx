import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getInstallationState } from "@/src/lib/auth/installation";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { SetupForm } from "@/app/(AuthModule)/_/components/setup/SetupForm";

// Setup availability changes once at runtime, after account creation.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { canSetup } = await getInstallationState();

  if (!canSetup) {
    notFound();
  }
  const t = await getTranslations("auth.pages.setup");

  return (
    <>
      <AuthHeading title={t("title")}>{t("description")}</AuthHeading>
      <SetupForm />
    </>
  );
}
