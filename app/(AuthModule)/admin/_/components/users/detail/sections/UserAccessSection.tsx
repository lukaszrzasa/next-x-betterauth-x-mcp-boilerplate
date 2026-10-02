"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatUtcDateTime } from "@/src/lib/date/format";
import { BanIcon, KeyRoundIcon, ShieldOffIcon } from "lucide-react";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { confirm } from "@/src/components/feedback/ConfirmDialog";
import { Button } from "@/src/components/ui/button";
import { toIsoInstant } from "@/src/lib/date/format";
import { ActionFeedback } from "@/src/components/feedback/ActionFeedback";
import { useFeedback } from "@/src/lib/hooks/useFeedback";
import { useRetryBanSessions } from "@/app/(AuthModule)/admin/_/hooks/actions/useRetryBanSessions";
import { useRetryUnbanSessionRefresh } from "@/app/(AuthModule)/admin/_/hooks/actions/useRetryUnbanSessionRefresh";
import { useUnbanUser } from "@/app/(AuthModule)/admin/_/hooks/actions/useUnbanUser";
import type { Feedback } from "@/app/(AuthModule)/admin/_/hooks/feedback";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";
import { AccessBadge, RoleBadges } from "@/app/(AuthModule)/admin/_/components/users/UserBadges";
import { UserBanDialog } from "@/app/(AuthModule)/admin/_/components/users/detail/forms/UserBanDialog";
import { policyNote } from "@/app/(AuthModule)/admin/_/components/users/detail/policyNote";

/**
 * Roles (read-only), effective access and the ban controls. A banned
 * account shows its reason and expiry; the controls are Ban (or Update ban)
 * and Remove ban, each shown only when permitted and applicable. Removing a
 * ban asks for confirmation; applying one has its own dialog.
 */
export function UserAccessSection({ user }: { user: UserDetail }) {
  const t = useTranslations("authAdmin.detail");
  const policyT = useTranslations("authAdmin.detail.policy");
  const locale = useLocale();
  const [banOpen, setBanOpen] = useState(false);
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();
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
    .map((capability) => (capability.allowed ? null : policyNote(policyT, capability.reason)))
    .find((note) => note !== null);

  const removeBan = async () => {
    const confirmed = await confirm({
      title: t("access.removeBanConfirm.title"),
      description: t("access.removeBanConfirm.description", { name: user.name, email: user.email }),
      confirmLabel: t("access.removeBanConfirm.confirm"),
      cancelLabel: t("access.removeBanConfirm.cancel"),
    });
    if (!confirmed) return;
    dismiss();
    void unban.run();
  };

  return (
    <DetailSection title={t("access.title")} description={t("access.description")} icon={KeyRoundIcon}>
      <ActionFeedback
        retryVerb={t("retryVerb")}
        feedback={feedback}
        onDismiss={dismiss}
        recovery={
          recovery ? { label: t("retry"), pending: recovery.pending, onClick: () => void recovery.run() } : undefined
        }
      />
      <div>
        <DetailRow label={t("access.roles")}>
          <RoleBadges roles={user.roles} />
        </DetailRow>
        <DetailRow
          label={t("access.effectiveAccess")}
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
                  {banned ? t("access.updateBan") : t("access.banUser")}
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
                  {unban.pending ? t("access.removing") : t("access.removeBan")}
                </Button>
              )}
            </>
          }
        >
          <AccessBadge status={user.accessStatus} banExpires={user.banExpires} />
        </DetailRow>
        {banned && (
          <>
            <DetailRow label={t("access.banReason")}>
              <p className="ui:whitespace-pre-line">{user.banReason ?? t("access.noReason")}</p>
            </DetailRow>
            <DetailRow label={t("access.banEnds")}>
              {user.banExpires ? (
                <time dateTime={toIsoInstant(user.banExpires)}>
                  {formatUtcDateTime(user.banExpires, locale)}
                </time>
              ) : (
                t("access.never")
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
