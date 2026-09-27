"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { formatUtcDateTime } from "@/src/lib/date/format";
import { useEmailProofConfirmation } from "@/app/(AuthModule)/_/hooks/settings/form/useEmailProofConfirmation";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import type { EmailProofInspection } from "@/app/(AuthModule)/_/types/settings";

const INACTIVE = {
  inactive: {
    title: "This link is not active",
    description: "It was already used, replaced or cancelled. If you still want to change your email, start again from your account settings.",
  },
  expired: {
    title: "This link has expired",
    description: "The request's 24-hour window has passed. Start the change again from your account settings.",
  },
} as const;

/**
 * The public proof page's body. Rendering does nothing; only the explicit
 * button submits the token. The page never uses the signed-in session, so
 * a link opened in another account's browser cannot touch that account.
 */
export function EmailConfirmation({ token, inspection }: { token: string | null; inspection: EmailProofInspection | null }) {
  const { confirmProof, pending, result } = useEmailProofConfirmation(token ?? "");

  if (result) {
    const terminal = result.tone === "success" || result.tone === "warning";
    return (
      <FieldGroup aria-live="polite">
        <Alert variant={result.tone === "error" ? "destructive" : "default"}>
          <AlertTitle>{result.title}</AlertTitle>
          {result.description && <AlertDescription>{result.description}</AlertDescription>}
        </Alert>
        {terminal && (
          <Button asChild className="ui:h-11">
            <Link href={authRoutes.signIn.href}>Go to sign in</Link>
          </Button>
        )}
      </FieldGroup>
    );
  }

  if (!token || !inspection || inspection.status !== "confirmable") {
    const text = INACTIVE[inspection?.status === "expired" ? "expired" : "inactive"];
    return (
      <FieldGroup aria-live="polite">
        <Alert variant="destructive">
          <AlertTitle>{text.title}</AlertTitle>
          <AlertDescription>{text.description}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="ui:h-11">
          <Link href={authRoutes.signIn.href}>Go to sign in</Link>
        </Button>
      </FieldGroup>
    );
  }

  return (
    <FieldGroup>
      <FieldDescription>
        {inspection.purpose === "current"
          ? `Confirm that ${inspection.maskedEmail} agrees to the sign-in email change. Afterwards, return to your account settings to enter the new address.`
          : `Confirm ${inspection.maskedEmail} as the new sign-in email. This completes the change and signs out every existing session.`}
      </FieldDescription>
      <FieldDescription>This link works until {formatUtcDateTime(inspection.expiresAt)}.</FieldDescription>
      <Button type="button" className="ui:h-11" disabled={pending} onClick={() => void confirmProof()}>
        {pending ? "Confirming…" : "Confirm email address"}
      </Button>
    </FieldGroup>
  );
}
