import "server-only";

import EmailChangeConfirmation, {
  type EmailChangePurpose,
} from "./templates/EmailChangeConfirmation";
import ResetPassword from "./templates/ResetPassword";
import TwoFactorOtp from "./templates/TwoFactorOtp";
import VerifyEmail from "./templates/VerifyEmail";
import { emailLocale, emailTranslator } from "./i18n";
import { sendEmail } from "./send";

/**
 * The application's messages. Each one goes through `sendEmail`, which
 * logs the attempt (see `send.ts`), and declares the secrets it carries -
 * the token, the link built from it, the code - so the log keeps none of
 * them. A resolved promise means the provider accepted the message.
 *
 * Each message is written in the language of whoever asked for it
 * (`emailLocale`): the subject and the body come from the `email` catalog,
 * and the log keeps them as sent.
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
  const locale = emailLocale(providerRequest);
  const t = emailTranslator(locale);
  return sendEmail({
    purpose: "verification",
    to,
    recipient,
    locale,
    subject: t("verify.subject"),
    react: <VerifyEmail url={url} name={name} locale={locale} t={t} />,
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
  const locale = emailLocale(providerRequest);
  const t = emailTranslator(locale);
  return sendEmail({
    purpose: "password-reset",
    to,
    recipient,
    locale,
    subject: t("reset.subject"),
    react: <ResetPassword url={url} name={name} locale={locale} t={t} />,
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
  const locale = emailLocale(providerRequest);
  const t = emailTranslator(locale);
  return sendEmail({
    purpose: "two-factor-code",
    to,
    recipient,
    locale,
    // The code is in the subject so it is readable from a notification banner.
    subject: t("otp.subject", { code }),
    react: <TwoFactorOtp code={code} expiresInMinutes={expiresInMinutes} name={name} locale={locale} t={t} />,
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
  expiresAt,
  name,
  recipient,
}: {
  to: string;
  url: string;
  token: string;
  purpose: EmailChangePurpose;
  /** The fixed deadline of the whole request. */
  expiresAt: Date;
  name?: string;
  recipient?: Recipient;
}) {
  const locale = emailLocale();
  const t = emailTranslator(locale);
  return sendEmail({
    purpose: purpose === "current" ? "email-change-current" : "email-change-new",
    to,
    recipient,
    locale,
    subject: purpose === "current" ? t("emailChange.current.subject") : t("emailChange.new.subject"),
    react: (
      <EmailChangeConfirmation
        url={url}
        purpose={purpose}
        expiresAt={expiresAt}
        name={name}
        locale={locale}
        t={t}
      />
    ),
    secrets: { url, token },
  });
}
