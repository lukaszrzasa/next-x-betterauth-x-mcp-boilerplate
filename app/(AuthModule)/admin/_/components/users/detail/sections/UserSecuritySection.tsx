"use client";

import { KeySquareIcon, LogOutIcon, MailCheckIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { confirm } from "@/src/components/feedback/ConfirmDialog";
import { Button } from "@/src/components/ui/button";
import { ActionFeedback } from "@/src/components/feedback/ActionFeedback";
import { useFeedback } from "@/src/lib/hooks/useFeedback";
import { useRevokeSessions } from "@/app/(AuthModule)/admin/_/hooks/actions/useRevokeSessions";
import { useSendPasswordReset } from "@/app/(AuthModule)/admin/_/hooks/actions/useSendPasswordReset";
import { useSendVerification } from "@/app/(AuthModule)/admin/_/hooks/actions/useSendVerification";
import type { Feedback } from "@/app/(AuthModule)/admin/_/hooks/feedback";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";
import { VerificationBadge } from "@/app/(AuthModule)/admin/_/components/users/UserBadges";
import { policyNote } from "@/app/(AuthModule)/admin/_/components/users/detail/policyNote";

/**
 * Verification and factor state, plus the account actions that touch them.
 * Controls appear only for permitted actions; a permitted action blocked by
 * root/self/staff policy shows one line of explanation instead. Signing out
 * asks for confirmation first; the emails send directly.
 */
export function UserSecuritySection({ user }: { user: UserDetail }) {
  const t = useTranslations("authAdmin.detail");
  const policyT = useTranslations("authAdmin.detail.policy");
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();
  const sendVerification = useSendVerification(user.id, { onSettled: setFeedback });
  const sendPasswordReset = useSendPasswordReset(user.id, { onSettled: setFeedback });
  const revokeSessions = useRevokeSessions(user.id, { onSettled: setFeedback });
  const anyPending = sendVerification.pending || sendPasswordReset.pending || revokeSessions.pending;
  const capabilities = user.capabilities;
  const blocked = [capabilities.sendVerification, capabilities.sendPasswordReset, capabilities.revokeSessions]
    .map((capability) => (capability.allowed ? null : policyNote(policyT, capability.reason)))
    .find((note) => note !== null);

  const start = (run: () => Promise<unknown>) => {
    dismiss();
    void run();
  };

  const signOutEverywhere = async () => {
    const confirmed = await confirm({
      title: t("security.signOutConfirm.title"),
      description: t(
        user.isSelf ? "security.signOutConfirm.descriptionSelf" : "security.signOutConfirm.description",
        { name: user.name, email: user.email },
      ),
      confirmLabel: t("security.signOutConfirm.confirm"),
    });
    if (confirmed) start(revokeSessions.run);
  };

  return (
    <DetailSection title={t("security.title")} description={t("security.description")} icon={ShieldCheckIcon}>
      <ActionFeedback
        retryVerb={t("retryVerb")}
        feedback={feedback}
        onDismiss={dismiss}
        recovery={
          feedback?.recovery === "revokeSessions"
            ? { label: t("retry"), pending: revokeSessions.pending, onClick: () => start(revokeSessions.run) }
            : undefined
        }
      />
      <div>
        <DetailRow
          label={t("security.emailVerification")}
          control={
            capabilities.sendVerification.allowed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={anyPending}
                onClick={() => start(sendVerification.run)}
              >
                <MailCheckIcon aria-hidden="true" />
                {sendVerification.pending ? t("security.sending") : t("security.sendVerification")}
              </Button>
            ) : undefined
          }
        >
          <VerificationBadge verified={user.emailVerified} />
        </DetailRow>
        <DetailRow label={t("security.twoFactorRequired")}>{user.twoFactorRequired ? t("yes") : t("no")}</DetailRow>
        <DetailRow label={t("security.twoFactorEnabled")}>{user.twoFactorEnabled ? t("yes") : t("no")}</DetailRow>
        <DetailRow
          label={t("security.password")}
          control={
            capabilities.sendPasswordReset.allowed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={anyPending}
                onClick={() => start(sendPasswordReset.run)}
              >
                <KeySquareIcon aria-hidden="true" />
                {sendPasswordReset.pending ? t("security.sending") : t("security.sendPasswordReset")}
              </Button>
            ) : undefined
          }
        >
          <span className="ui:text-muted-foreground">{t("security.passwordNote")}</span>
        </DetailRow>
        <DetailRow
          label={t("security.sessions")}
          control={
            capabilities.revokeSessions.allowed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={anyPending}
                onClick={() => void signOutEverywhere()}
              >
                <LogOutIcon aria-hidden="true" />
                {revokeSessions.pending ? t("security.signingOut") : t("security.signOutAll")}
              </Button>
            ) : undefined
          }
        >
          <span className="ui:text-muted-foreground">{t("security.sessionsNote")}</span>
        </DetailRow>
        {blocked && <p className="ui:pt-4 ui:text-xs ui:text-muted-foreground">{blocked}</p>}
      </div>
    </DetailSection>
  );
}
