import { requirePendingEnrollment } from "../../_/guards";
import { AuthHeading } from "../../_/components/layout/AuthHeading";
import { EnrollmentForm } from "../../_/components/enrollment/EnrollmentForm";
import { SignOutButton } from "../../_/components/session/SignOutButton";

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
