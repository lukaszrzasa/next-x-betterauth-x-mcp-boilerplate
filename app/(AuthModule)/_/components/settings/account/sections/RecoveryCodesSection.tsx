"use client";

import { useState } from "react";
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
  const [issued, setIssued] = useState<Issued | null>(null);

  if (!issued) {
    return (
      <RegenerateRecoveryCodesForm
        onIssued={(result) => {
          if (result.status === "completed-codes-unavailable") {
            onSettled({ tone: "warning", title: "New codes were generated but could not be shown", description: "Your previous codes no longer work. Generate again to get a set you can save." });
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
        onSettled({ tone: "success", title: "New recovery codes generated", description: "Your previous codes no longer work." });
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
  const [flow, setFlow] = useState<{ key: number; issued: boolean } | null>(null);
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();

  if (!account.twoFactorEnabled) return null;

  return (
    <DetailSection title="Recovery codes" description="One-time codes that replace your authenticator when it is unavailable." icon={LifeBuoyIcon}>
      <ActionFeedback feedback={feedback} onDismiss={dismiss} />
      <div>
        <DetailRow
          label="Codes"
          control={
            account.emailVerified ? (
              <Button type="button" variant="outline" size="sm" onClick={() => { dismiss(); setFlow({ key: Date.now(), issued: false }); }}>
                <RefreshCwIcon aria-hidden="true" />
                Generate new codes
              </Button>
            ) : undefined
          }
        >
          <span className="ui:text-muted-foreground">
            Generating a new set replaces every previous code immediately. Codes are shown once, when generated.
          </span>
        </DetailRow>
      </div>
      {flow && (
        <FormDialog
          open
          onOpenChange={(next) => !next && setFlow(null)}
          title={flow.issued ? "Save your new recovery codes" : "Generate new recovery codes"}
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
