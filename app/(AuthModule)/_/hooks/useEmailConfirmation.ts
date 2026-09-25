"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/src/lib/auth/client";
import { authRoutes } from "@/src/lib/auth/routes";

export type EmailConfirmationStatus = "verifying" | "confirmed" | "failed";

/** Verifies the token from the confirmation link once, as soon as the page opens. */
export function useEmailConfirmation(token?: string): EmailConfirmationStatus {
  const [status, setStatus] = useState<EmailConfirmationStatus>(
    token ? "verifying" : "failed",
  );
  const verificationStarted = useRef(false);

  useEffect(() => {
    // The token is single-use, so guard against Strict Mode running this effect twice.
    if (!token || verificationStarted.current) {
      return;
    }

    verificationStarted.current = true;

    authClient
      .verifyEmail({ query: { token } })
      .then(({ error }) => {
        setStatus(error ? "failed" : "confirmed");
        // Once consumed, drop the token from the address bar so a refresh cannot resubmit it.
        window.history.replaceState(null, "", authRoutes.emailConfirmation);
      })
      .catch(() => setStatus("failed"));
  }, [token]);

  return status;
}
