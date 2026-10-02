"use client";

import { useRouter } from "next/navigation";
import { useCatalog } from "@/src/lib/i18n/useCatalog";
import { useAction } from "@/src/lib/actions";
import {
  cancelEmailRequestAction,
  resendEmailRequestAction,
  resendVerificationAction,
} from "@/app/(AuthModule)/_/actions";
import {
  describeCancelOutcome,
  describeEmailRequestOutcome,
  describeSettingsFailure,
  type Feedback,
} from "@/app/(AuthModule)/_/hooks/settings/feedback";

/**
 * The one-click controls of the email section: resend the pending stage's
 * link, cancel the request, and the ordinary verification email for an
 * unverified address. Each reports through `onSettled` and refreshes the
 * server-rendered status after a change.
 */
export function useEmailRequestActions({ onSettled }: { onSettled: (feedback: Feedback) => void }) {
  const router = useRouter();
  const t = useCatalog();
  const resend = useAction(resendEmailRequestAction, { onError: () => true });
  const cancel = useAction(cancelEmailRequestAction, { onError: () => true });
  const verification = useAction(resendVerificationAction, { onError: () => true });

  return {
    pending: resend.isPending || cancel.isPending || verification.isPending,
    async resend(requestId: string) {
      const result = await resend.execute({ requestId });
      if (result.status === "success") {
        onSettled(describeEmailRequestOutcome(t, result.data, true));
        router.refresh();
      } else if (result.status === "error") {
        onSettled(describeSettingsFailure(t, result.error));
        if (result.error.reason === "NOT_FOUND" || result.error.reason === "CONFLICT") router.refresh();
      }
    },
    async cancel(requestId: string) {
      const result = await cancel.execute({ requestId });
      if (result.status === "success") {
        onSettled(describeCancelOutcome(t, result.data, t("auth.settings.feedback.emailChangeWhat")));
        router.refresh();
      } else if (result.status === "error") {
        onSettled(describeSettingsFailure(t, result.error));
      }
    },
    async resendVerification() {
      const result = await verification.execute(undefined);
      if (result.status === "success") {
        onSettled(
          result.data.status === "completed"
            ? {
                tone: "success",
                title: t("auth.settings.feedback.verificationSent.title"),
                description: t("auth.settings.feedback.verificationSent.description"),
              }
            : { tone: "info", title: t("auth.settings.feedback.alreadyVerified") },
        );
        if (result.data.status === "unchanged") router.refresh();
      } else if (result.status === "error") {
        onSettled(describeSettingsFailure(t, result.error));
      }
    },
  };
}
