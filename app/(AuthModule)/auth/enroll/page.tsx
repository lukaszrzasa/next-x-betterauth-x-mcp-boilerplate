import { requirePendingEnrollment } from "@/app/(AuthModule)/_/guards";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { EnrollmentForm } from "@/app/(AuthModule)/_/components/enrollment/EnrollmentForm";
import { SignOutButton } from "@/app/(AuthModule)/_/components/session/SignOutButton";

export default async function EnrollmentPage() {
  await requirePendingEnrollment();

  return (
    <>
      <AuthHeading title="Set up your authenticator">
        Your account requires an authenticator before you can access the app.
      </AuthHeading>
      <EnrollmentForm />
      <div className="ui:mt-6">
        <SignOutButton />
      </div>
    </>
  );
}
