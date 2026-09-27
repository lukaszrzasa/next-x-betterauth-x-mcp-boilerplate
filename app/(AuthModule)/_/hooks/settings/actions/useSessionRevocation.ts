"use client";

import { confirm, type ConfirmRequest } from "@/src/components/feedback/ConfirmDialog";
import { formatUtcDateTime } from "@/src/lib/date/format";
import { describeUserAgent } from "@/src/lib/userAgent";
import { useFeedback } from "@/src/lib/hooks/useFeedback";
import type { RecoveryKind } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { SessionItem } from "@/app/(AuthModule)/_/types/settings";
import { useRevokeAllSessions } from "./useRevokeAllSessions";
import { useRevokeOtherSessions } from "./useRevokeOtherSessions";
import { useRevokeSession } from "./useRevokeSession";

const SIGN_OUT_OTHERS: ConfirmRequest = {
  title: "Sign out other devices?",
  description: "Every session except this one ends immediately. They can sign in again.",
  confirmLabel: "Sign out other devices",
};

const SIGN_OUT_EVERYWHERE: ConfirmRequest = {
  title: "Sign out everywhere?",
  description: "Every session ends immediately, including this one. You will be taken to the sign-in page.",
  confirmLabel: "Sign out everywhere",
  destructive: true,
};

function signOutSessionRequest(session: SessionItem): ConfirmRequest {
  return {
    title: "Sign this session out?",
    description: `${describeUserAgent(session.userAgent)}, signed in ${formatUtcDateTime(session.createdAt)}, is signed out immediately. It can sign in again.`,
    confirmLabel: "Sign out session",
  };
}

/**
 * The Sessions section's three ways to end sessions, each asked for
 * confirmation first (no step-up), with one shared feedback slot and the
 * retry a partial outcome offers. Retries skip the confirmation: the person
 * already confirmed that change.
 */
export function useSessionRevocation() {
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

  return {
    feedback,
    dismiss,
    pending,
    recovery: retry ? { label: "Retry", pending, onClick: () => void retry() } : undefined,
    signOutSession: (session: SessionItem) =>
      void afterConfirming(signOutSessionRequest(session), () => revokeOne.run(session.id)),
    signOutOthers: () => void afterConfirming(SIGN_OUT_OTHERS, revokeOthers.run),
    signOutEverywhere: () => void afterConfirming(SIGN_OUT_EVERYWHERE, revokeAll.run),
  };
}
