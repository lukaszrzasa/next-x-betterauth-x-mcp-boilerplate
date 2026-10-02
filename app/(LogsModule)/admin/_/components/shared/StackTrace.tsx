"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "@/src/components/actions/CopyButton";

/** A stored (redacted) stack trace, collapsed by default; Copy copies exactly what is shown. */
export function StackTrace({ value }: { value: string }) {
  const t = useTranslations("logsAdmin.shared.stackTrace");
  return (
    <details className="ui:group ui:rounded-md ui:border">
      <summary className="ui:cursor-pointer ui:px-3 ui:py-2 ui:text-sm ui:font-medium ui:select-none">
        {t("title")}
      </summary>
      <div className="ui:flex ui:flex-col ui:gap-2 ui:border-t ui:p-3">
        <div className="ui:flex ui:justify-end">
          <CopyButton value={value} label={t("copy")}>
            {t("copy")}
          </CopyButton>
        </div>
        <pre className="ui:max-h-72 ui:overflow-auto ui:rounded-md ui:bg-muted ui:p-3 ui:font-mono ui:text-xs ui:whitespace-pre-wrap ui:break-words">
          {value}
        </pre>
      </div>
    </details>
  );
}
