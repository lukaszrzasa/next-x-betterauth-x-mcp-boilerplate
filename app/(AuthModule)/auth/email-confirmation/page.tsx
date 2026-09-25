import { AuthHeading } from "../../_/components/layout/AuthHeading";
import { EmailConfirmation } from "../../_/components/signUp/EmailConfirmation";

export default async function EmailConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <>
      <AuthHeading title="Confirm your email">
        This verifies the email address linked to your account.
      </AuthHeading>
      <EmailConfirmation
        token={typeof token === "string" ? token : undefined}
      />
    </>
  );
}
