import "server-only";

import EmailChangeConfirmation, {
  type EmailChangePurpose,
} from "./templates/EmailChangeConfirmation";
import ResetPassword from "./templates/ResetPassword";
import TwoFactorOtp from "./templates/TwoFactorOtp";
import VerifyEmail from "./templates/VerifyEmail";
import { sendEmail } from "./send";

/**
 * The application's messages. Each one goes through `sendEmail`, which
 * logs the attempt (see `send.ts`), and declares the secrets it carries -
 * the token, the link built from it, the code - so the log keeps none of
 * them. A resolved promise means the provider accepted the message.
 */

export { EmailDeliveryError, type EmailPurpose } from "./send";

/** The account a message is about, for the log; its address is `to`. */
type Recipient = { userId: string; name?: string | null };

/** Request headers of a Better Auth callback; see `OutgoingEmail.providerRequest`. */
type ProviderRequest = { providerRequest?: Headers | null };

export function sendVerificationEmail({
  to,
  url,
  token,
  name,
  recipient,
  providerRequest,
}: {
  to: string;
  url: string;
  token: string;
  name?: string;
  recipient?: Recipient;
} & ProviderRequest) {
  return sendEmail({
    purpose: "verification",
    to,
    recipient,
    subject: "Verify your email address",
    react: <VerifyEmail url={url} name={name} />,
    secrets: { url, token },
    providerRequest,
  });
}

export function sendPasswordResetEmail({
  to,
  url,
  token,
  name,
  recipient,
  providerRequest,
}: {
  to: string;
  url: string;
  token: string;
  name?: string;
  recipient?: Recipient;
} & ProviderRequest) {
  return sendEmail({
    purpose: "password-reset",
    to,
    recipient,
    subject: "Reset your password",
    react: <ResetPassword url={url} name={name} />,
    secrets: { url, token },
    providerRequest,
  });
}

export function sendTwoFactorOtpEmail({
  to,
  code,
  expiresInMinutes,
  name,
  recipient,
  providerRequest,
}: {
  to: string;
  code: string;
  expiresInMinutes: number;
  name?: string;
  recipient?: Recipient;
} & ProviderRequest) {
  return sendEmail({
    purpose: "two-factor-code",
    to,
    recipient,
    // The code is in the subject so it is readable from a notification banner.
    subject: `${code} is your verification code`,
    react: <TwoFactorOtp code={code} expiresInMinutes={expiresInMinutes} name={name} />,
    secrets: { code },
    providerRequest,
  });
}

export type { EmailChangePurpose };

/** A link-only confirmation for one stage of a sign-in email change; never a code. */
export function sendEmailChangeConfirmationEmail({
  to,
  url,
  token,
  purpose,
  expiresAtLabel,
  name,
  recipient,
}: {
  to: string;
  url: string;
  token: string;
  purpose: EmailChangePurpose;
  expiresAtLabel: string;
  name?: string;
  recipient?: Recipient;
}) {
  return sendEmail({
    purpose: purpose === "current" ? "email-change-current" : "email-change-new",
    to,
    recipient,
    subject:
      purpose === "current"
        ? "Confirm your sign-in email change"
        : "Confirm your new sign-in email address",
    react: (
      <EmailChangeConfirmation url={url} purpose={purpose} expiresAtLabel={expiresAtLabel} name={name} />
    ),
    secrets: { url, token },
  });
}
