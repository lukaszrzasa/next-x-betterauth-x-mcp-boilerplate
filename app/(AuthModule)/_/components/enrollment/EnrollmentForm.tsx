"use client";

import { useEnrollmentForm } from "@/app/(AuthModule)/_/hooks/form/useEnrollmentForm";
import { EnrollmentPasswordStep } from "./EnrollmentPasswordStep";
import { EnrollmentVerifyStep } from "./EnrollmentVerifyStep";
import { RecoveryCodes } from "./RecoveryCodes";

export function EnrollmentForm() {
  const { step, showVerification, showRecoveryCodes, continueToPanel } =
    useEnrollmentForm();

  switch (step.name) {
    case "password":
      return <EnrollmentPasswordStep onStarted={showVerification} />;
    case "verify":
      return (
        <EnrollmentVerifyStep
          totpURI={step.setup.totpURI}
          onVerified={showRecoveryCodes}
        />
      );
    case "recoveryCodes":
      return <RecoveryCodes codes={step.codes} onContinue={continueToPanel} />;
  }
}
