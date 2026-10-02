"use client";

import { useTranslations } from "next-intl";
import { confirm, type ConfirmRequest } from "@/src/components/feedback/ConfirmDialog";
import { describeUserAgent, deviceWording } from "@/src/lib/userAgent";
import { useFeedback } from "@/src/lib/hooks/useFeedback";
import type { RecoveryKind } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { SessionItem } from "@/app/(AuthModule)/_/types/settings";
import { useRevokeAllSessions } from "./useRevokeAllSessions";
import { useRevokeOtherSessions } from "./useRevokeOtherSessions";
import { useRevokeSession } from "./useRevokeSession";


/**
 * The Sessions section's three ways to end sessions, each asked for
 * confirmation first (no step-up), with one shared feedback slot and the
 * retry a partial outcome offers. Retries skip the confirmation: the person
 * already confirmed that change.
 */
export function useSessionRevocation() {
  const t = useTranslations("auth.settings.sessions");
  const tCommon = useTranslations("common");
  const tDevice = useTranslations("common.device");
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();
  const revokeOne = useRevokeSession({ onSettled: setFeedback });
  const revokeOthers = useRevokeOtherSessions({ onSettled: setFeedback });
  const revokeAll = useRevokeAllSessions({ onSettled: setFeedback });
  const pending = revokeOne.pending || revokeOthers.pending || revokeAll.pending;

  const afterConfirming = async (request: ConfirmRequest, run: () => Promise<unknown>) => {
    if (!(await confirm(request))) return;
    dismiss();
    await run();
  };

  const retries: Partial<Record<RecoveryKind, () => Promise<unknown>>> = {
    revokeOtherSessions: revokeOthers.run,
    revokeAllSessions: revokeAll.run,
  };
  const retry = feedback?.recovery ? retries[feedback.recovery] : undefined;

  const signOutOthers: ConfirmRequest = {
    title: t("confirmOthers.title"),
    description: t("confirmOthers.description"),
    confirmLabel: t("confirmOthers.confirm"),
  };
  const signOutEverywhere: ConfirmRequest = {
    title: t("confirmEverywhere.title"),
    description: t("confirmEverywhere.description"),
    confirmLabel: t("confirmEverywhere.confirm"),
    destructive: true,
  };
  const signOutSessionRequest = (session: SessionItem): ConfirmRequest => ({
    title: t("confirmSession.title"),
    description: t("confirmSession.description", {
      device: describeUserAgent(session.userAgent, deviceWording(tDevice)),
      signedIn: new Date(session.createdAt),
    }),
    confirmLabel: t("confirmSession.confirm"),
  });

  return {
    feedback,
    dismiss,
    pending,
    recovery: retry ? { label: tCommon("actions.retry"), pending, onClick: () => void retry() } : undefined,
    signOutSession: (session: SessionItem) =>
      void afterConfirming(signOutSessionRequest(session), () => revokeOne.run(session.id)),
    signOutOthers: () => void afterConfirming(signOutOthers, revokeOthers.run),
    signOutEverywhere: () => void afterConfirming(signOutEverywhere, revokeAll.run),
  };
}
