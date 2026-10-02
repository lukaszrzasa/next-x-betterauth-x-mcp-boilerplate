"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";
import { useEmailProofConfirmation } from "@/app/(AuthModule)/_/hooks/settings/form/useEmailProofConfirmation";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import type { EmailProofInspection } from "@/app/(AuthModule)/_/types/settings";

/**
 * The public proof page's body. Rendering does nothing; only the explicit
 * button submits the token. The page never uses the signed-in session, so
 * a link opened in another account's browser cannot touch that account.
 */
export function EmailConfirmation({ token, inspection }: { token: string | null; inspection: EmailProofInspection | null }) {
  const t = useTranslations("auth.emailProof");
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
            <Link href={authRoutes.signIn.href}>{t("goToSignIn")}</Link>
          </Button>
        )}
      </FieldGroup>
    );
  }

  if (!token || !inspection || inspection.status !== "confirmable") {
    const state = inspection?.status === "expired" ? "expired" : "inactive";
    return (
      <FieldGroup aria-live="polite">
        <Alert variant="destructive">
          <AlertTitle>{t(`${state}.title`)}</AlertTitle>
          <AlertDescription>{t(`${state}.description`)}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="ui:h-11">
          <Link href={authRoutes.signIn.href}>{t("goToSignIn")}</Link>
        </Button>
      </FieldGroup>
    );
  }

  return (
    <FieldGroup>
      <FieldDescription>
        {inspection.purpose === "current"
          ? t("currentIntro", { maskedEmail: inspection.maskedEmail })
          : t("newIntro", { maskedEmail: inspection.maskedEmail })}
      </FieldDescription>
      <FieldDescription>{t("validUntil", { expiresAt: new Date(inspection.expiresAt) })}</FieldDescription>
      <Button type="button" className="ui:h-11" disabled={pending} onClick={() => void confirmProof()}>
        {pending ? t("confirming") : t("confirm")}
      </Button>
    </FieldGroup>
  );
}
