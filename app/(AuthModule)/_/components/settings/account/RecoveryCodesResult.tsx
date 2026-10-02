"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import { copyText } from "@/src/lib/browser/clipboard";
import { downloadTextFile } from "@/src/lib/browser/download";
import { appName } from "@/src/lib/config";

const DOWNLOAD_FILE_NAME = "account-recovery-codes.txt";

type ResultTranslator = ReturnType<typeof useTranslations<"auth.settings.recoveryCodes.result">>;

/** The downloaded file: a heading, when the set was issued, the codes, and how to use them. */
function recoveryCodesFile(t: ResultTranslator, codes: readonly string[], issuedAt: string): string {
  const lines = [
    t("fileHeading", { appName }),
    t("fileGenerated", { issuedAt: new Date(issuedAt) }),
    "",
    ...codes,
    "",
    t("fileNote"),
  ];
  return lines.join("\n");
}

/**
 * Ten newly issued codes, once. Copy and download are offered; "I have saved
 * these codes" closes the panel. The values live only in the props of this
 * component, rendered inside a disposable flow that unmounts on close.
 */
export function RecoveryCodesResult({
  codes,
  issuedAt,
  warning,
  onAcknowledge,
}: {
  codes: readonly string[];
  issuedAt: string;
  /** A partial outcome to state next to the codes. */
  warning?: string;
  onAcknowledge: () => void;
}) {
  const t = useTranslations("auth.settings.recoveryCodes.result");
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const copy = async () => {
    const copied = await copyText(codes.join("\n"));
    setNotice(copied ? t("copied") : t("copyFailed"));
  };

  return (
    <div className="ui:flex ui:flex-col ui:gap-4" role="region" aria-label={t("region")}>
      {warning && (
        <p role="alert" className="ui:text-sm ui:text-amber-900 ui:dark:text-amber-200">
          {warning}
        </p>
      )}
      <p className="ui:text-sm ui:text-muted-foreground">{t("intro")}</p>
      <Card className="ui:bg-muted">
        <CardContent>
          <ul className="ui:grid ui:list-none ui:grid-cols-1 ui:gap-2 ui:p-0 ui:font-mono ui:text-sm ui:sm:grid-cols-2">
            {codes.map((code) => (
              <li key={code}>
                <code className="ui:select-all">{code}</code>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="ui:flex ui:flex-wrap ui:gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          <CopyIcon aria-hidden="true" />
          {t("copyAll")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => downloadTextFile(DOWNLOAD_FILE_NAME, recoveryCodesFile(t, codes, issuedAt))}
        >
          <DownloadIcon aria-hidden="true" />
          {t("download")}
        </Button>
      </div>
      {notice && (
        <p role="status" className="ui:text-xs ui:text-muted-foreground">
          {notice}
        </p>
      )}
      <div className="ui:flex ui:items-start ui:gap-3">
        <Checkbox id="recovery-codes-saved" checked={saved} onCheckedChange={(checked) => setSaved(checked === true)} />
        <Label htmlFor="recovery-codes-saved" className="ui:leading-relaxed">
          {t("saved")}
        </Label>
      </div>
      <div className="ui:flex ui:justify-end">
        <Button type="button" size="sm" disabled={!saved} onClick={onAcknowledge}>
          {t("done")}
        </Button>
      </div>
    </div>
  );
}
