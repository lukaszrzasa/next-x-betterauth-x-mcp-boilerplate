"use client";

import { KeySquareIcon, LogOutIcon, MailCheckIcon, ShieldCheckIcon } from "lucide-react";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { confirm } from "@/src/components/feedback/ConfirmDialog";
import { Button } from "@/src/components/ui/button";
import { useRevokeSessions } from "@/app/(AuthModule)/admin/_/hooks/actions/useRevokeSessions";
import { useSendPasswordReset } from "@/app/(AuthModule)/admin/_/hooks/actions/useSendPasswordReset";
import { useSendVerification } from "@/app/(AuthModule)/admin/_/hooks/actions/useSendVerification";
import { useActionFeedback } from "@/app/(AuthModule)/admin/_/hooks/useActionFeedback";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";
import { VerificationBadge } from "@/app/(AuthModule)/admin/_/components/users/UserBadges";
import { policyNote } from "@/app/(AuthModule)/admin/_/components/users/detail/policyNote";
import { UserActionFeedback } from "@/app/(AuthModule)/admin/_/components/users/detail/UserActionFeedback";

/**
 * Verification and factor state, plus the account actions that touch them.
 * Controls appear only for permitted actions; a permitted action blocked by
 * root/self/staff policy shows one line of explanation instead. Signing out
 * asks for confirmation first; the emails send directly.
 */
export function UserSecuritySection({ user }: { user: UserDetail }) {
  const { feedback, setFeedback, dismiss } = useActionFeedback();
  const sendVerification = useSendVerification(user.id, { onSettled: setFeedback });
  const sendPasswordReset = useSendPasswordReset(user.id, { onSettled: setFeedback });
  const revokeSessions = useRevokeSessions(user.id, { onSettled: setFeedback });
  const anyPending = sendVerification.pending || sendPasswordReset.pending || revokeSessions.pending;
  const capabilities = user.capabilities;
  const blocked = [capabilities.sendVerification, capabilities.sendPasswordReset, capabilities.revokeSessions]
    .map((capability) => (capability.allowed ? null : policyNote(capability.reason)))
    .find((note) => note !== null);

  const start = (run: () => Promise<unknown>) => {
    dismiss();
    void run();
  };

  const signOutEverywhere = async () => {
    const confirmed = await confirm({
      title: "Sign this user out of all devices?",
      description: `Every current session of ${user.name} (${user.email}) ends immediately. This does not ban the account; the user can sign in again.${
        user.isSelf ? " This is your own account: you will be signed out as well." : ""
      }`,
      confirmLabel: "Sign out everywhere",
    });
    if (confirmed) start(revokeSessions.run);
  };

  return (
    <DetailSection
      title="Security"
      description="Email verification, second factor and session controls."
      icon={ShieldCheckIcon}
    >
      <UserActionFeedback
        feedback={feedback}
        onDismiss={dismiss}
        recovery={
          feedback?.recovery === "revokeSessions"
            ? { label: "Retry", pending: revokeSessions.pending, onClick: () => start(revokeSessions.run) }
            : undefined
        }
      />
      <div>
        <DetailRow
          label="Email verification"
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
                {sendVerification.pending ? "Sending…" : "Send verification email"}
              </Button>
            ) : undefined
          }
        >
          <VerificationBadge verified={user.emailVerified} />
        </DetailRow>
        <DetailRow label="Two-factor required">{user.twoFactorRequired ? "Yes" : "No"}</DetailRow>
        <DetailRow label="Two-factor enabled">{user.twoFactorEnabled ? "Yes" : "No"}</DetailRow>
        <DetailRow
          label="Password"
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
                {sendPasswordReset.pending ? "Sending…" : "Send password-reset email"}
              </Button>
            ) : undefined
          }
        >
          <span className="ui:text-muted-foreground">
            A reset email lets the user choose a new password. Existing factors stay enabled.
          </span>
        </DetailRow>
        <DetailRow
          label="Sessions"
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
                {revokeSessions.pending ? "Signing out…" : "Sign out of all devices"}
              </Button>
            ) : undefined
          }
        >
          <span className="ui:text-muted-foreground">
            Signing out ends every current session. The user can sign in again afterwards.
          </span>
        </DetailRow>
        {blocked && <p className="ui:pt-4 ui:text-xs ui:text-muted-foreground">{blocked}</p>}
      </div>
    </DetailSection>
  );
}
