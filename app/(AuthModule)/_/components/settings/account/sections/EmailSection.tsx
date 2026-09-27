"use client";

import { useState } from "react";
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
      title: "Cancel this email change?",
      description: "The links already sent stop working. Your sign-in address stays as it is.",
      confirmLabel: "Cancel request",
      cancelLabel: "Keep request",
    });
    if (confirmed) {
      dismiss();
      await actions.cancel(request.id);
    }
  };

  return (
    <DetailSection title="Email address" description="The address you sign in with and where account email is sent." icon={MailIcon}>
      <ActionFeedback feedback={feedback} onDismiss={dismiss} />
      <div>
        <DetailRow
          label="Current address"
          control={
            account.emailVerified ? (
              <EditButton disabled={actions.pending} onClick={() => show("change")}>
                {pendingRequest ? "Start over" : "Change email"}
              </EditButton>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={actions.pending} onClick={() => { dismiss(); void actions.resendVerification(); }}>
                <MailCheckIcon aria-hidden="true" />
                Verify email
              </Button>
            )
          }
        >
          <span className="ui:flex ui:flex-wrap ui:items-center ui:gap-2">
            <span className="ui:font-medium ui:break-all">{account.email}</span>
            {account.emailVerified ? (
              <Badge variant="secondary">Verified</Badge>
            ) : (
              <Badge variant="outline" className="ui:text-muted-foreground">Unverified</Badge>
            )}
          </span>
          {!account.emailVerified && (
            <p className="ui:mt-1 ui:text-xs ui:text-muted-foreground">
              Changing the password or the authenticator needs a verified address. Entered the wrong email
              when signing up?{" "}
              <Button
                type="button"
                variant="link"
                size="xs"
                className="ui:h-auto ui:p-0 ui:text-xs"
                disabled={actions.pending}
                onClick={() => show("correct")}
              >
                {pendingRequest ? "Start the correction over" : "Correct it"}
              </Button>
            </p>
          )}
        </DetailRow>

        {request.state !== "none" && (
          <DetailRow label="Pending change">
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
        title={pendingRequest ? "Start a new email change" : "Change your sign-in email"}
      >
        <EmailChangeForm email={account.email} replacing={pendingRequest} onCancel={close} onSettled={setFeedback} />
      </FormDialog>
      <FormDialog
        open={open === "correct"}
        onOpenChange={(next) => !next && close()}
        title="Correct your email address"
      >
        <EmailCorrectionForm email={account.email} twoFactorEnabled={account.twoFactorEnabled} onCancel={close} onSettled={setFeedback} />
      </FormDialog>
      {request.state === "awaiting_new_address" && (
        <FormDialog open={open === "newAddress"} onOpenChange={(next) => !next && close()} title="Enter your new email address">
          <NewEmailForm requestId={request.id} onCancel={close} onSettled={setFeedback} />
        </FormDialog>
      )}
    </DetailSection>
  );
}
