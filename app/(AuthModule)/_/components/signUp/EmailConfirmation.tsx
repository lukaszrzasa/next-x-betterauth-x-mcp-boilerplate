"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import {
  useEmailConfirmation,
  type EmailConfirmationStatus,
} from "@/app/(AuthModule)/_/hooks/useEmailConfirmation";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

const statusMessages: Record<
  EmailConfirmationStatus,
  { title: string; description: string }
> = {
  verifying: {
    title: "Confirming your email",
    description: "Please wait while we verify your confirmation link.",
  },
  confirmed: {
    title: "Email confirmed",
    description: "Your email address has been successfully verified.",
  },
  failed: {
    title: "Unable to confirm email",
    description:
      "This link is missing, invalid, or expired. Use the confirmation link from your email.",
  },
};

export function EmailConfirmation({ token }: { token?: string }) {
  const status = useEmailConfirmation(token);
  const message = statusMessages[status];

  return (
    <FieldGroup aria-live="polite">
      <Alert variant={status === "failed" ? "destructive" : "default"}>
        <AlertTitle>{message.title}</AlertTitle>
        <AlertDescription>{message.description}</AlertDescription>
      </Alert>
      {status !== "verifying" && (
        <Button asChild className="ui:h-11">
          <Link href={authRoutes.panel.href}>Continue</Link>
        </Button>
      )}
    </FieldGroup>
  );
}
