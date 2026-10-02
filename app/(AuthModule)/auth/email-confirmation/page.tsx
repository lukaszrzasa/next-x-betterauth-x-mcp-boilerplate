import { getTranslations } from "next-intl/server";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { EmailConfirmation } from "@/app/(AuthModule)/_/components/signUp/EmailConfirmation";

export default async function EmailConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, t] = await Promise.all([searchParams, getTranslations("auth.pages.emailConfirmation")]);

  return (
    <>
      <AuthHeading title={t("title")}>{t("description")}</AuthHeading>
      <EmailConfirmation
        token={typeof token === "string" ? token : undefined}
      />
    </>
  );
}
