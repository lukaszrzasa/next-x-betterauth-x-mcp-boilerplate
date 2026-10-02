import { getTranslations } from "next-intl/server";
import { requirePendingEnrollment } from "@/app/(AuthModule)/_/guards";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { EnrollmentForm } from "@/app/(AuthModule)/_/components/enrollment/EnrollmentForm";
import { SignOutButton } from "@/app/(AuthModule)/_/components/session/SignOutButton";

export default async function EnrollmentPage() {
  await requirePendingEnrollment();
  const t = await getTranslations("auth.pages.enroll");

  return (
    <>
      <AuthHeading title={t("title")}>{t("description")}</AuthHeading>
      <EnrollmentForm />
      <div className="ui:mt-6">
        <SignOutButton />
      </div>
    </>
  );
}
