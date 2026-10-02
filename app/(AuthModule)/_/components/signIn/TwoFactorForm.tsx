"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { AuthenticatorChallengeForm } from "./AuthenticatorChallengeForm";
import { EmailChallengeForm } from "./EmailChallengeForm";
import { RecoveryChallengeForm } from "./RecoveryChallengeForm";

type ChallengeMethod = "authenticator" | "recovery" | "email";

const METHODS: readonly ChallengeMethod[] = ["authenticator", "recovery", "email"];

const SWITCH_LABELS = {
  authenticator: "useAuthenticator",
  recovery: "useRecovery",
  email: "useEmail",
} as const;

/**
 * Second sign-in step. The authenticator is the default; a recovery code or an
 * emailed code covers a lost device. Switching methods discards the current
 * form, but an email code is requested automatically only once per sign-in.
 */
export function TwoFactorForm({ onRestart }: { onRestart: () => void }) {
  const t = useTranslations("auth.signIn.twoFactor");
  const [method, setMethod] = useState<ChallengeMethod>("authenticator");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const markEmailCodeSent = useCallback(() => setEmailCodeSent(true), []);

  return (
    <>
      {method === "authenticator" && <AuthenticatorChallengeForm />}
      {method === "recovery" && <RecoveryChallengeForm />}
      {method === "email" && (
        <EmailChallengeForm
          autoRequest={!emailCodeSent}
          onRequested={markEmailCodeSent}
        />
      )}
      <div className="ui:mt-7 ui:flex ui:flex-col ui:gap-7">
        {METHODS.filter((candidate) => candidate !== method).map((candidate) => (
          <Button
            key={candidate}
            type="button"
            variant="link"
            onClick={() => setMethod(candidate)}
          >
            {t(SWITCH_LABELS[candidate])}
          </Button>
        ))}
        <Button type="button" variant="link" onClick={onRestart}>
          {t("restart")}
        </Button>
      </div>
    </>
  );
}
