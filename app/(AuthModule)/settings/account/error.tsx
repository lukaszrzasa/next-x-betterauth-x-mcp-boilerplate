"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@/src/components/feedback/ErrorState";

export default function AccountError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("auth.settingsPages");
  return <ErrorState title={t("accountErrorTitle")} message={t("accountErrorMessage")} retry={retry} />;
}
