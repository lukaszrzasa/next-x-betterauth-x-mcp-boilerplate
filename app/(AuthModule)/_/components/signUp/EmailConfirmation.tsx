"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FieldGroup } from "@/src/components/ui/field";
import {
  useEmailConfirmation,
  type EmailConfirmationStatus,
} from "@/app/(AuthModule)/_/hooks/useEmailConfirmation";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export function EmailConfirmation({ token }: { token?: string }) {
  const t = useTranslations("auth.signUp.confirmation");
  const status: EmailConfirmationStatus = useEmailConfirmation(token);

  return (
    <FieldGroup aria-live="polite">
      <Alert variant={status === "failed" ? "destructive" : "default"}>
        <AlertTitle>{t(`${status}.title`)}</AlertTitle>
        <AlertDescription>{t(`${status}.description`)}</AlertDescription>
      </Alert>
      {status !== "verifying" && (
        <Button asChild className="ui:h-11">
          <Link href={authRoutes.panel.href}>{t("continue")}</Link>
        </Button>
      )}
    </FieldGroup>
  );
}
