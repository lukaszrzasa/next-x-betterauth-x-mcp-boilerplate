"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MailIcon, MailCheckIcon } from "lucide-react";
import { EditButton } from "@/src/components/actions/EditButton";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { confirm } from "@/src/components/feedback/ConfirmDialog";
import { FormDialog } from "@/src/components/feedback/FormDialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ActionFeedback } from "@/src/components/feedback/ActionFeedback";
import { useFeedback } from "@/src/lib/hooks/useFeedback";
import { useEmailRequestActions } from "@/app/(AuthModule)/_/hooks/settings/actions/useEmailRequestActions";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { AccountSettings } from "@/app/(AuthModule)/_/types/settings";
import { EmailChangeForm } from "@/app/(AuthModule)/_/components/settings/account/forms/EmailChangeForm";
import { EmailCorrectionForm } from "@/app/(AuthModule)/_/components/settings/account/forms/EmailCorrectionForm";
import { NewEmailForm } from "@/app/(AuthModule)/_/components/settings/account/forms/NewEmailForm";
import { EmailRequestStatus } from "@/app/(AuthModule)/_/components/settings/account/EmailRequestStatus";

type Open = "change" | "correct" | "newAddress" | null;

/**
 * The sign-in address: its verification state, the pending request's stage
 * and next step, and exactly the controls that apply. Every form opens in a
 * modal. A verified address changes through the dual-mailbox flow; an
 * unverified one is verified as usual or corrected through its own flow.
 */
export function EmailSection({ account }: { account: AccountSettings }) {
  const t = useTranslations("auth.settings.email");
  const [open, setOpen] = useState<Open>(null);
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();
  const actions = useEmailRequestActions({ onSettled: setFeedback });
  const request = account.pendingEmail;
  const pendingRequest = request.state !== "none";

  const show = (next: Open) => {
    dismiss();
    setOpen(next);
  };
  const close = () => setOpen(null);

  const cancelRequest = async () => {
    if (request.state === "none") return;
    const confirmed = await confirm({
      title: t("cancelConfirm.title"),
      description: t("cancelConfirm.description"),
      confirmLabel: t("cancelConfirm.confirm"),
      cancelLabel: t("cancelConfirm.keep"),
    });
    if (confirmed) {
      dismiss();
      await actions.cancel(request.id);
    }
  };

  return (
    <DetailSection title={t("title")} description={t("description")} icon={MailIcon}>
      <ActionFeedback feedback={feedback} onDismiss={dismiss} />
      <div>
        <DetailRow
          label={t("currentAddress")}
          control={
            account.emailVerified ? (
              <EditButton disabled={actions.pending} onClick={() => show("change")}>
                {pendingRequest ? t("startOver") : t("changeEmail")}
              </EditButton>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={actions.pending} onClick={() => { dismiss(); void actions.resendVerification(); }}>
                <MailCheckIcon aria-hidden="true" />
                {t("verifyEmail")}
              </Button>
            )
          }
        >
          <span className="ui:flex ui:flex-wrap ui:items-center ui:gap-2">
            <span className="ui:font-medium ui:break-all">{account.email}</span>
            {account.emailVerified ? (
              <Badge variant="secondary">{t("verified")}</Badge>
            ) : (
              <Badge variant="outline" className="ui:text-muted-foreground">{t("unverified")}</Badge>
            )}
          </span>
          {!account.emailVerified && (
            <p className="ui:mt-1 ui:text-xs ui:text-muted-foreground">
              {t("unverifiedHint")}{" "}
              <Button
                type="button"
                variant="link"
                size="xs"
                className="ui:h-auto ui:p-0 ui:text-xs"
                disabled={actions.pending}
                onClick={() => show("correct")}
              >
                {pendingRequest ? t("restartCorrection") : t("correctIt")}
              </Button>
            </p>
          )}
        </DetailRow>

        {request.state !== "none" && (
          <DetailRow label={t("pendingChange")}>
            <EmailRequestStatus
              request={request}
              pending={actions.pending}
              onResend={() => { dismiss(); void actions.resend(request.id); }}
              onCancel={() => void cancelRequest()}
              onEnterNewAddress={request.state === "awaiting_new_address" ? () => show("newAddress") : undefined}
            />
          </DetailRow>
        )}
      </div>

      <FormDialog
        open={open === "change"}
        onOpenChange={(next) => !next && close()}
        title={pendingRequest ? t("dialogChangeNew") : t("dialogChange")}
      >
        <EmailChangeForm email={account.email} replacing={pendingRequest} onCancel={close} onSettled={setFeedback} />
      </FormDialog>
      <FormDialog
        open={open === "correct"}
        onOpenChange={(next) => !next && close()}
        title={t("dialogCorrect")}
      >
        <EmailCorrectionForm email={account.email} twoFactorEnabled={account.twoFactorEnabled} onCancel={close} onSettled={setFeedback} />
      </FormDialog>
      {request.state === "awaiting_new_address" && (
        <FormDialog open={open === "newAddress"} onOpenChange={(next) => !next && close()} title={t("dialogNewAddress")}>
          <NewEmailForm requestId={request.id} onCancel={close} onSettled={setFeedback} />
        </FormDialog>
      )}
    </DetailSection>
  );
}
