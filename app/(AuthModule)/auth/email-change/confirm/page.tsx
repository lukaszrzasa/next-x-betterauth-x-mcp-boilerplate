import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { EmailConfirmation } from "@/app/(AuthModule)/_/components/emailChange/EmailConfirmation";
import { inspectEmailProofQuery } from "@/app/(AuthModule)/_/queries";
import { confirmationTokenSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { ActionError } from "@/src/lib/auth/errors";
import type { EmailProofInspection } from "@/app/(AuthModule)/_/types/settings";

/** Never cached or prefetched into a mutation: the render inspects, the button confirms. */
export const dynamic = "force-dynamic";

/**
 * `/auth/email-change/confirm?token=…`: public, with or without a session,
 * and deliberately not guest-only. GET only inspects the token (no
 * mutation in render, mount or prefetch); the explicit submit in the client
 * component is the proof. The auth layout already marks these pages
 * noindex and no-referrer.
 */
export default async function EmailChangeConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const parsed = confirmationTokenSchema.safeParse(typeof token === "string" ? token : "");

  let inspection: EmailProofInspection | null = null;
  if (parsed.success) {
    try {
      inspection = await inspectEmailProofQuery({ token: parsed.data });
    } catch (error) {
      if (!ActionError.is(error)) throw error;
      inspection = { status: "inactive" };
    }
  }

  return (
    <>
      <AuthHeading title="Confirm your email address">
        This confirms one step of a sign-in email change requested from your account settings.
      </AuthHeading>
      <EmailConfirmation token={parsed.success ? parsed.data : null} inspection={inspection} />
    </>
  );
}
