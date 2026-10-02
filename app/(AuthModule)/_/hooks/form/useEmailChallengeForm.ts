"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/src/lib/auth/client";
import { emailChallengeSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "@/app/(AuthModule)/_/hooks/useSessionRedirect";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export type EmailCodeDelivery =
  | { status: "sending" }
  | { status: "sent" }
  | { status: "failed"; message: string };

/**
 * Completes sign-in with a six-digit code emailed by Better Auth.
 *
 * `autoRequest` asks for a code as soon as the form opens; the parent turns it
 * off once a code has been sent, so switching methods back and forth does not
 * mail a fresh code each time. The user can always request another explicitly.
 */
export function useEmailChallengeForm({
  autoRequest,
  onRequested,
}: {
  autoRequest: boolean;
  onRequested: () => void;
}) {
  const t = useTranslations("auth");
  const redirect = useSessionRedirect();
  const [delivery, setDelivery] = useState<EmailCodeDelivery>({
    status: autoRequest ? "sending" : "sent",
  });
  const requested = useRef(false);
  const { form, createSubmitHandler } = useSchemaForm(emailChallengeSchema);

  const sendCode = useCallback(async () => {
    setDelivery({ status: "sending" });
    const { error } = await authClient.twoFactor.sendOtp();
    setDelivery(
      error
        ? { status: "failed", message: error.message || t("signIn.emailChallenge.sendFailed") }
        : { status: "sent" },
    );
    if (!error) onRequested();
  }, [onRequested, t]);

  useEffect(() => {
    // Strict Mode runs effects twice; the ref keeps this to one request per mount.
    if (!autoRequest || requested.current) return;
    requested.current = true;
    void sendCode();
  }, [autoRequest, sendCode]);

  const onSubmit = createSubmitHandler(async ({ code }) => {
    unwrapAuthResult(
      await authClient.twoFactor.verifyOtp({ code, trustDevice: false }),
      t("client.verifyCodeFailed"),
    );
    redirect(authRoutes.panel.href);
  });

  return { form, onSubmit, delivery, resendCode: sendCode };
}
