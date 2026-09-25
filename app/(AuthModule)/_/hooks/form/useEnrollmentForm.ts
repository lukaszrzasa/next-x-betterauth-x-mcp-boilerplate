"use client";

import { useState } from "react";
import type { AuthenticatorSetup } from "./useEnrollmentPasswordStep";
import { useSessionRedirect } from "../useSessionRedirect";

export type EnrollmentStep =
  | { name: "password" }
  | { name: "verify"; setup: AuthenticatorSetup }
  | { name: "recoveryCodes"; codes: string[] };

/**
 * Sequences enrollment: confirm password → scan and verify the authenticator →
 * save recovery codes. Each step owns its own form and request; this hook only
 * decides which step is shown and what that step needs.
 */
export function useEnrollmentForm() {
  const redirect = useSessionRedirect();
  const [step, setStep] = useState<EnrollmentStep>({ name: "password" });

  function showVerification(setup: AuthenticatorSetup) {
    setStep({ name: "verify", setup });
  }

  /** Recovery codes arrive with the setup but are revealed only once the authenticator is proven. */
  function showRecoveryCodes() {
    setStep((current) =>
      current.name === "verify"
        ? { name: "recoveryCodes", codes: current.setup.backupCodes }
        : current,
    );
  }

  function continueToPanel() {
    redirect("/panel");
  }

  return { step, showVerification, showRecoveryCodes, continueToPanel };
}
