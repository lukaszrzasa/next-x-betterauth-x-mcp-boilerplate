"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LifeBuoyIcon, RefreshCwIcon } from "lucide-react";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { FormDialog } from "@/src/components/feedback/FormDialog";
import { Button } from "@/src/components/ui/button";
import { ActionFeedback } from "@/src/components/feedback/ActionFeedback";
import { useFeedback } from "@/src/lib/hooks/useFeedback";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { AccountSettings, RecoveryCodesIssued } from "@/app/(AuthModule)/_/types/settings";
import { RegenerateRecoveryCodesForm } from "@/app/(AuthModule)/_/components/settings/account/forms/RegenerateRecoveryCodesForm";
import { RecoveryCodesResult } from "@/app/(AuthModule)/_/components/settings/account/RecoveryCodesResult";

type Issued = Exclude<RecoveryCodesIssued, { status: "completed-codes-unavailable" }>;

/** The regeneration as a disposable child: the form's action result and the panel go away together. */
function RegenerateFlow({
  onSettled,
  onClose,
  onIssued,
}: {
  onSettled: (feedback: Feedback) => void;
  onClose: () => void;
  onIssued: () => void;
}) {
  const t = useTranslations("auth.settings.recoveryCodes");
  const [issued, setIssued] = useState<Issued | null>(null);

  if (!issued) {
    return (
      <RegenerateRecoveryCodesForm
        onIssued={(result) => {
          if (result.status === "completed-codes-unavailable") {
            onSettled({ tone: "warning", title: t("unavailable.title"), description: t("unavailable.description") });
            onClose();
            return;
          }
          setIssued(result);
          onIssued();
        }}
        onCancel={onClose}
      />
    );
  }
  return (
    <RecoveryCodesResult
      codes={issued.recoveryCodes}
      issuedAt={issued.issuedAt}
      onAcknowledge={() => {
        onSettled({ tone: "success", title: t("generated.title"), description: t("generated.description") });
        onClose();
      }}
    />
  );
}

/**
 * Explanation and regeneration, for enrolled accounts only: without an
 * authenticator there are no recovery codes, so the section is not shown.
 * No count of unused codes is displayed.
 */
export function RecoveryCodesSection({ account }: { account: AccountSettings }) {
  const t = useTranslations("auth.settings.recoveryCodes");
  const [flow, setFlow] = useState<{ key: number; issued: boolean } | null>(null);
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();

  if (!account.twoFactorEnabled) return null;

  return (
    <DetailSection title={t("title")} description={t("description")} icon={LifeBuoyIcon}>
      <ActionFeedback feedback={feedback} onDismiss={dismiss} />
      <div>
        <DetailRow
          label={t("codes")}
          control={
            account.emailVerified ? (
              <Button type="button" variant="outline" size="sm" onClick={() => { dismiss(); setFlow({ key: Date.now(), issued: false }); }}>
                <RefreshCwIcon aria-hidden="true" />
                {t("generate")}
              </Button>
            ) : undefined
          }
        >
          <span className="ui:text-muted-foreground">
            {t("hint")}
          </span>
        </DetailRow>
      </div>
      {flow && (
        <FormDialog
          open
          onOpenChange={(next) => !next && setFlow(null)}
          title={flow.issued ? t("dialogSave") : t("dialogGenerate")}
          className={flow.issued ? "ui:sm:max-w-xl" : undefined}
        >
          <RegenerateFlow
            key={flow.key}
            onSettled={setFeedback}
            onClose={() => setFlow(null)}
            onIssued={() => setFlow((current) => (current ? { ...current, issued: true } : current))}
          />
        </FormDialog>
      )}
    </DetailSection>
  );
}
