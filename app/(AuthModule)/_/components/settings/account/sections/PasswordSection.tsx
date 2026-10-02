"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("auth.settings.password");
  const [open, setOpen] = useState(false);
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();

  return (
    <DetailSection title={t("title")} description={t("description")} icon={KeyRoundIcon}>
      <ActionFeedback feedback={feedback} onDismiss={dismiss} />
      <div>
        <DetailRow
          label={t("label")}
          control={
            account.emailVerified ? (
              <EditButton onClick={() => { dismiss(); setOpen(true); }}>{t("change")}</EditButton>
            ) : undefined
          }
        >
          {account.emailVerified ? (
            <span className="ui:text-muted-foreground">{t("policy")}</span>
          ) : (
            <span className="ui:text-muted-foreground">{t("unverifiedHint")}</span>
          )}
        </DetailRow>
      </div>
      <FormDialog open={open} onOpenChange={setOpen} title={t("dialogTitle")}>
        <ChangePasswordForm onCancel={() => setOpen(false)} onSettled={setFeedback} />
      </FormDialog>
    </DetailSection>
  );
}
