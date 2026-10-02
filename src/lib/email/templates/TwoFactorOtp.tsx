import type { Locale } from "@/src/lib/i18n/locales";
import {
  appName,
  EmailCode,
  EmailHeading,
  EmailLayout,
  EmailNote,
  EmailText,
  type EmailTranslator,
} from "./_components";

export type TwoFactorOtpProps = {
  code: string;
  expiresInMinutes: number;
  name?: string;
  locale: Locale;
  t: EmailTranslator;
};

export default function TwoFactorOtp({ code, expiresInMinutes, name, locale, t }: TwoFactorOtpProps) {
  const greeting = name ? t("greeting", { name }) : "";
  return (
    <EmailLayout locale={locale} preview={t("otp.preview", { appName, code })}>
      <EmailHeading>{t("otp.heading")}</EmailHeading>
      <EmailText>{t("otp.body", { greeting, appName, minutes: expiresInMinutes })}</EmailText>
      <EmailCode>{code}</EmailCode>
      <EmailNote>{t("otp.note")}</EmailNote>
    </EmailLayout>
  );
}
