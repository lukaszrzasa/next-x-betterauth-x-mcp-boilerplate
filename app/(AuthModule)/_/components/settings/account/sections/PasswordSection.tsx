"use client";

import { useState } from "react";
import { KeyRoundIcon } from "lucide-react";
import { EditButton } from "@/src/components/actions/EditButton";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { FormDialog } from "@/src/components/feedback/FormDialog";
import { ActionFeedback } from "@/src/components/feedback/ActionFeedback";
import { useFeedback } from "@/src/lib/hooks/useFeedback";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { AccountSettings } from "@/app/(AuthModule)/_/types/settings";
import { ChangePasswordForm } from "@/app/(AuthModule)/_/components/settings/account/forms/ChangePasswordForm";

/** The password: a row whose button opens the change form in a modal. Nothing about its age is shown. */
export function PasswordSection({ account }: { account: AccountSettings }) {
  const [open, setOpen] = useState(false);
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();

  return (
    <DetailSection title="Password" description="Used together with your email address to sign in." icon={KeyRoundIcon}>
      <ActionFeedback feedback={feedback} onDismiss={dismiss} />
      <div>
        <DetailRow
          label="Password"
          control={
            account.emailVerified ? (
              <EditButton onClick={() => { dismiss(); setOpen(true); }}>Change password</EditButton>
            ) : undefined
          }
        >
          {account.emailVerified ? (
            <span className="ui:text-muted-foreground">Between 8 and 128 characters.</span>
          ) : (
            <span className="ui:text-muted-foreground">Verify your email address to change the password here. A forgotten password can always be reset from the sign-in page.</span>
          )}
        </DetailRow>
      </div>
      <FormDialog open={open} onOpenChange={setOpen} title="Change your password">
        <ChangePasswordForm onCancel={() => setOpen(false)} onSettled={setFeedback} />
      </FormDialog>
    </DetailSection>
  );
}
