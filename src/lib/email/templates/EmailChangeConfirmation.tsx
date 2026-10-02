import type { Locale } from "@/src/lib/i18n/locales";
import {
  appName,
  EmailButton,
  EmailFallbackLink,
  EmailHeading,
  EmailLayout,
  EmailText,
  type EmailTranslator,
} from "./_components";

export type EmailChangePurpose = "current" | "new";

export type EmailChangeConfirmationProps = {
  url: string;
  purpose: EmailChangePurpose;
  /** The fixed deadline of the whole request, rendered in the message's locale. */
  expiresAt: Date;
  name?: string;
  locale: Locale;
  t: EmailTranslator;
};

/**
 * The two link-only confirmations of a sign-in email change: the current
 * mailbox confirms that the change may proceed, the new mailbox confirms
 * that it is the intended destination and completes it. No code is ever
 * mailed; the button is the proof.
 */
export default function EmailChangeConfirmation({
  url,
  purpose,
  expiresAt,
  name,
  locale,
  t,
}: EmailChangeConfirmationProps) {
  const greeting = name ? t("greeting", { name }) : "";
  const copy = purpose === "current" ? "emailChange.current" : "emailChange.new";

  return (
    <EmailLayout locale={locale} preview={t(`${copy}.preview`, { appName })}>
      <EmailHeading>{t(`${copy}.heading`)}</EmailHeading>
      <EmailText>{t(`${copy}.body`, { greeting, appName })}</EmailText>
      <EmailText>{t(`${copy}.validUntil`, { expiresAt })}</EmailText>
      <EmailButton href={url}>{t(`${copy}.button`)}</EmailButton>
      <EmailFallbackLink href={url} intro={t("layout.fallbackIntro")} note={t(`${copy}.note`)} />
    </EmailLayout>
  );
}
