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

export type VerifyEmailProps = {
  url: string;
  name?: string;
  locale: Locale;
  t: EmailTranslator;
};

export default function VerifyEmail({ url, name, locale, t }: VerifyEmailProps) {
  const greeting = name ? t("greeting", { name }) : "";
  return (
    <EmailLayout locale={locale} preview={t("verify.preview", { appName })}>
      <EmailHeading>{t("verify.heading")}</EmailHeading>
      <EmailText>{t("verify.body", { greeting, appName })}</EmailText>
      <EmailButton href={url}>{t("verify.button")}</EmailButton>
      <EmailFallbackLink href={url} intro={t("layout.fallbackIntro")} note={t("verify.note")} />
    </EmailLayout>
  );
}
