"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@/src/components/feedback/ErrorState";

/** The list could not be loaded (a slow query, a database outage): safe message plus Retry. */
export default function EmailLogsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("logsAdmin.emailLogs.error");
  return (
    <ErrorState
      title={t("title")}
      message={t("message")}
      retry={retry}
    />
  );
}
