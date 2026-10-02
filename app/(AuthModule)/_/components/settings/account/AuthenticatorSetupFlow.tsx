"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCancelSetup } from "@/app/(AuthModule)/_/hooks/settings/actions/useCancelSetup";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { RecoveryCodesIssued, SetupStarted } from "@/app/(AuthModule)/_/types/settings";
import { AuthenticatorSetupForm } from "@/app/(AuthModule)/_/components/settings/account/forms/AuthenticatorSetupForm";
import { SetupCodeForm } from "@/app/(AuthModule)/_/components/settings/account/forms/SetupCodeForm";
import { RecoveryCodesResult } from "@/app/(AuthModule)/_/components/settings/account/RecoveryCodesResult";

export type SetupKind = "enroll" | "replace";
type Issued = Exclude<RecoveryCodesIssued, { status: "completed-codes-unavailable" }>;
type Step = { name: "password" } | { name: "code"; setup: SetupStarted } | { name: "codes"; issued: Issued };
export type SetupStepName = Step["name"];

/** The dialog title of each step, as a catalog key under `auth.settings.authenticator.setupFlow.titles`. */
export const setupStepTitleKey = (kind: SetupKind, step: SetupStepName) =>
  `auth.settings.authenticator.setupFlow.titles.${kind}.${step}` as const;

/**
 * One setup or replacement, start to finish, inside a modal as a disposable
 * child: the action hooks that receive the QR material and the new recovery
 * codes are mounted here and nowhere else, so closing the modal (done,
 * cancelled, expired) unmounts them and their results. The parent keeps a
 * boolean and a mount key.
 */
export function AuthenticatorSetupFlow({
  kind,
  onSettled,
  onClose,
  onStep,
}: {
  kind: SetupKind;
  onSettled: (feedback: Feedback) => void;
  onClose: () => void;
  onStep: (step: SetupStepName) => void;
}) {
  const t = useTranslations("auth.settings.authenticator.setupFlow");
  const router = useRouter();
  const [step, setStepState] = useState<Step>({ name: "password" });
  const cancelSetup = useCancelSetup();
  const done = t(`done.${kind}`);

  const setStep = (next: Step) => {
    setStepState(next);
    onStep(next.name);
  };

  const settle = (feedback: Feedback) => {
    onSettled(feedback);
    onClose();
  };

  const cancel = () => {
    if (step.name === "code") void cancelSetup.cancel(step.setup.requestId);
    onClose();
  };

  const codesUnavailableFeedback = (): Feedback => ({
    tone: "warning",
    title: t("codesUnavailableTitle", { done }),
    description: t("codesUnavailableDescription"),
  });

  const completedFeedback = (issued: Issued): Feedback => {
    if (issued.status !== "partial") return { tone: "success", title: done };
    return {
      tone: "warning",
      title: t("partialTitle", { done }),
      description: t("partialDescription"),
      recovery: "retryFactorSessionRefresh",
    };
  };

  const completed = (issued: RecoveryCodesIssued) => {
    router.refresh();
    if (issued.status === "completed-codes-unavailable") settle(codesUnavailableFeedback());
    else setStep({ name: "codes", issued });
  };

  switch (step.name) {
    case "password":
      return (
        <AuthenticatorSetupForm kind={kind} onStarted={(setup) => setStep({ name: "code", setup })} onCancel={onClose} />
      );
    case "code":
      return (
        <SetupCodeForm
          setup={step.setup}
          onCompleted={completed}
          onClosed={(message) => settle({ tone: "warning", title: message })}
          onCancel={cancel}
        />
      );
    case "codes":
      return (
        <RecoveryCodesResult
          codes={step.issued.recoveryCodes}
          issuedAt={step.issued.issuedAt}
          warning={step.issued.status === "partial" ? t("partialWarning") : undefined}
          onAcknowledge={() => settle(completedFeedback(step.issued))}
        />
      );
  }
}
