import "server-only";

import type { ReactNode } from "react";
import { Resend } from "resend";

import ResetPassword from "./templates/ResetPassword";
import TwoFactorOtp from "./templates/TwoFactorOtp";
import VerifyEmail from "./templates/VerifyEmail";

let client: Resend | undefined;

/**
 * Lazily constructed: `new Resend()` throws when RESEND_API_KEY is missing, and
 * doing that at import time would break builds on machines without the key.
 */
function resend() {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }

    client = new Resend(apiKey);
  }

  return client;
}

/**
 * Verified sending domain, e.g. "Boilerplate <no-reply@example.com>".
 * `onboarding@resend.dev` is Resend's shared sandbox sender: it only delivers to
 * the email address that owns the Resend account, so it is dev-only.
 */
const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: ReactNode;
}) {
  // Resend returns errors rather than throwing them.
  const { data, error } = await resend().emails.send({ from, to, subject, react });

  if (error) {
    throw new Error(`Resend failed to send "${subject}": ${error.message}`);
  }

  return data;
}

export function sendVerificationEmail({
  to,
  url,
  name,
}: {
  to: string;
  url: string;
  name?: string;
}) {
  return sendEmail({
    to,
    subject: "Verify your email address",
    react: <VerifyEmail url={url} name={name} />,
  });
}

export function sendPasswordResetEmail({
  to,
  url,
  name,
}: {
  to: string;
  url: string;
  name?: string;
}) {
  return sendEmail({
    to,
    subject: "Reset your password",
    react: <ResetPassword url={url} name={name} />,
  });
}

export function sendTwoFactorOtpEmail({
  to,
  code,
  expiresInMinutes,
  name,
}: {
  to: string;
  code: string;
  expiresInMinutes: number;
  name?: string;
}) {
  return sendEmail({
    // The code is in the subject so it is readable from a notification banner.
    subject: `${code} is your verification code`,
    to,
    react: (
      <TwoFactorOtp code={code} expiresInMinutes={expiresInMinutes} name={name} />
    ),
  });
}
