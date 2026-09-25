"use client";

import { useState } from "react";
import { BanIcon, KeyRoundIcon, ShieldOffIcon } from "lucide-react";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { confirm } from "@/src/components/feedback/ConfirmDialog";
import { Button } from "@/src/components/ui/button";
import { formatUtcDateTime, toIsoInstant } from "@/src/lib/date/format";
import { useRetryBanSessions } from "@/app/(AuthModule)/admin/_/hooks/actions/useRetryBanSessions";
import { useRetryUnbanSessionRefresh } from "@/app/(AuthModule)/admin/_/hooks/actions/useRetryUnbanSessionRefresh";
import { useUnbanUser } from "@/app/(AuthModule)/admin/_/hooks/actions/useUnbanUser";
import { useActionFeedback } from "@/app/(AuthModule)/admin/_/hooks/useActionFeedback";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";
import { AccessBadge, RoleBadges } from "@/app/(AuthModule)/admin/_/components/users/UserBadges";
import { UserBanDialog } from "@/app/(AuthModule)/admin/_/components/users/detail/forms/UserBanDialog";
import { policyNote } from "@/app/(AuthModule)/admin/_/components/users/detail/policyNote";
import { UserActionFeedback } from "@/app/(AuthModule)/admin/_/components/users/detail/UserActionFeedback";

/**
 * Roles (read-only), effective access and the ban controls. A banned
 * account shows its reason and expiry; the controls are Ban (or Update ban)
 * and Remove ban, each shown only when permitted and applicable. Removing a
 * ban asks for confirmation; applying one has its own dialog.
 */
export function UserAccessSection({ user }: { user: UserDetail }) {
  const [banOpen, setBanOpen] = useState(false);
  const { feedback, setFeedback, dismiss } = useActionFeedback();
  const unban = useUnbanUser(user.id, { onSettled: setFeedback });
  const retryBanSessions = useRetryBanSessions(user.id, { onSettled: setFeedback });
  const retryUnbanSessionRefresh = useRetryUnbanSessionRefresh(user.id, { onSettled: setFeedback });
  const recovery = {
    retryBanSessions,
    retryUnbanSessionRefresh,
  }[feedback?.recovery as "retryBanSessions" | "retryUnbanSessionRefresh"];
  const anyPending = unban.pending || retryBanSessions.pending || retryUnbanSessionRefresh.pending;
  const { ban: banCapability, unban: unbanCapability } = user.capabilities;
  const banned = user.accessStatus !== "active";
  const blocked = [banCapability, unbanCapability]
    .map((capability) => (capability.allowed ? null : policyNote(capability.reason)))
    .find((note) => note !== null);

  const removeBan = async () => {
    const confirmed = await confirm({
      title: "Remove the ban?",
      description: `${user.name} (${user.email}) will be able to sign in again. Nothing else changes: no session is created, the email stays as it is and roles are untouched.`,
      confirmLabel: "Remove ban",
      cancelLabel: "Keep ban",
    });
    if (!confirmed) return;
    dismiss();
    void unban.run();
  };

  return (
    <DetailSection
      title="Access"
      description="Roles and whether the account may sign in."
      icon={KeyRoundIcon}
    >
      <UserActionFeedback
        feedback={feedback}
        onDismiss={dismiss}
        recovery={
          recovery ? { label: "Retry", pending: recovery.pending, onClick: () => void recovery.run() } : undefined
        }
      />
      <div>
        <DetailRow label="Roles">
          <RoleBadges roles={user.roles} />
        </DetailRow>
        <DetailRow
          label="Effective access"
          control={
            <>
              {banCapability.allowed && (
                <Button
                  type="button"
                  variant={banned ? "outline" : "destructive"}
                  size="sm"
                  disabled={anyPending}
                  onClick={() => {
                    dismiss();
                    setBanOpen(true);
                  }}
                >
                  <BanIcon aria-hidden="true" />
                  {banned ? "Update ban" : "Ban user"}
                </Button>
              )}
              {unbanCapability.allowed && banned && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={anyPending}
                  onClick={() => void removeBan()}
                >
                  <ShieldOffIcon aria-hidden="true" />
                  {unban.pending ? "Removing…" : "Remove ban"}
                </Button>
              )}
            </>
          }
        >
          <AccessBadge status={user.accessStatus} banExpires={user.banExpires} />
        </DetailRow>
        {banned && (
          <>
            <DetailRow label="Ban reason">
              <p className="ui:whitespace-pre-line">{user.banReason ?? "No reason recorded"}</p>
            </DetailRow>
            <DetailRow label="Ban ends">
              {user.banExpires ? (
                <time dateTime={toIsoInstant(user.banExpires)}>{formatUtcDateTime(user.banExpires)}</time>
              ) : (
                "Never (permanent)"
              )}
            </DetailRow>
          </>
        )}
        {blocked && <p className="ui:pt-4 ui:text-xs ui:text-muted-foreground">{blocked}</p>}
      </div>

      {banCapability.allowed && (
        <UserBanDialog user={user} open={banOpen} onOpenChange={setBanOpen} onSettled={setFeedback} />
      )}
    </DetailSection>
  );
}
