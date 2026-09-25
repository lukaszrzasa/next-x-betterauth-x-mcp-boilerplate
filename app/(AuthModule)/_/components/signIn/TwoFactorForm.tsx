"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { AuthenticatorChallengeForm } from "./AuthenticatorChallengeForm";
import { RecoveryChallengeForm } from "./RecoveryChallengeForm";

/** Second sign-in step: the authenticator challenge, or a recovery code when the device is lost. */
export function TwoFactorForm({ onRestart }: { onRestart: () => void }) {
  const [usingRecoveryCode, setUsingRecoveryCode] = useState(false);

  return (
    <>
      {usingRecoveryCode ? (
        <RecoveryChallengeForm />
      ) : (
        <AuthenticatorChallengeForm />
      )}
      <div className="ui:mt-7 ui:flex ui:flex-col ui:gap-7">
        <Button
          type="button"
          variant="link"
          onClick={() => setUsingRecoveryCode((current) => !current)}
        >
          {usingRecoveryCode
            ? "Use an authenticator code"
            : "Use a recovery code"}
        </Button>
        <Button type="button" variant="link" onClick={onRestart}>
          Start sign-in again
        </Button>
      </div>
    </>
  );
}
