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

export type ResetPasswordProps = {
  url: string;
  name?: string;
  locale: Locale;
  t: EmailTranslator;
};

export default function ResetPassword({ url, name, locale, t }: ResetPasswordProps) {
  const greeting = name ? t("greeting", { name }) : "";
  return (
    <EmailLayout locale={locale} preview={t("reset.preview", { appName })}>
      <EmailHeading>{t("reset.heading")}</EmailHeading>
      <EmailText>{t("reset.body", { greeting, appName })}</EmailText>
      <EmailButton href={url}>{t("reset.button")}</EmailButton>
      <EmailFallbackLink href={url} intro={t("layout.fallbackIntro")} note={t("reset.note")} />
    </EmailLayout>
  );
}
