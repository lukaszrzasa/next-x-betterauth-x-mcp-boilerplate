"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/src/lib/auth/client";
import { emailChallengeSchema } from "@/app/(AuthModule)/_/schema";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "@/app/(AuthModule)/_/hooks/useSessionRedirect";
import { authRoutes } from "@/src/lib/auth/routes";

export type EmailCodeDelivery =
  | { status: "sending" }
  | { status: "sent" }
  | { status: "failed"; message: string };

const SEND_FAILED_MESSAGE = "The code could not be sent. Try again in a moment.";

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
        ? { status: "failed", message: error.message || SEND_FAILED_MESSAGE }
        : { status: "sent" },
    );
    if (!error) onRequested();
  }, [onRequested]);

  useEffect(() => {
    // Strict Mode runs effects twice; the ref keeps this to one request per mount.
    if (!autoRequest || requested.current) return;
    requested.current = true;
    void sendCode();
  }, [autoRequest, sendCode]);

  const onSubmit = createSubmitHandler(async ({ code }) => {
    unwrapAuthResult(
      await authClient.twoFactor.verifyOtp({ code, trustDevice: false }),
      "Unable to verify this code.",
    );
    redirect(authRoutes.panel);
  });

  return { form, onSubmit, delivery, resendCode: sendCode };
}
