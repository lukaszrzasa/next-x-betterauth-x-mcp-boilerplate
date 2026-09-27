"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export const SETUP_STEP_TITLES: Record<SetupKind, Record<SetupStepName, string>> = {
  enroll: { password: "Set up an authenticator", code: "Scan and confirm", codes: "Save your recovery codes" },
  replace: { password: "Replace your authenticator", code: "Scan and confirm the new one", codes: "Save your new recovery codes" },
};

const DONE: Record<SetupKind, string> = { enroll: "Authenticator activated", replace: "Authenticator replaced" };

const PARTIAL_WARNING =
  "Your authenticator is active, but your other sessions could not be updated yet. Retry from the section afterwards.";

function codesUnavailableFeedback(kind: SetupKind): Feedback {
  return {
    tone: "warning",
    title: `${DONE[kind]}, but its recovery codes could not be shown`,
    description: "Generate new recovery codes to get a set you can save.",
  };
}

function completedFeedback(kind: SetupKind, issued: Issued): Feedback {
  if (issued.status !== "partial") return { tone: "success", title: DONE[kind] };
  return {
    tone: "warning",
    title: `${DONE[kind]}, but`,
    description: "your other sessions could not be updated yet.",
    recovery: "retryFactorSessionRefresh",
  };
}

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
  const router = useRouter();
  const [step, setStepState] = useState<Step>({ name: "password" });
  const cancelSetup = useCancelSetup();

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

  const completed = (issued: RecoveryCodesIssued) => {
    router.refresh();
    if (issued.status === "completed-codes-unavailable") settle(codesUnavailableFeedback(kind));
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
          warning={step.issued.status === "partial" ? PARTIAL_WARNING : undefined}
          onAcknowledge={() => settle(completedFeedback(kind, step.issued))}
        />
      );
  }
}
