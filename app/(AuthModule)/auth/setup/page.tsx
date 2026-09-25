import { notFound } from "next/navigation";
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

  return (
    <>
      <AuthHeading title="Set up your new project">
        Create the root administrator account to get started.
      </AuthHeading>
      <SetupForm />
    </>
  );
}
