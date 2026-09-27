"use client";

import { useState } from "react";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import { copyText } from "@/src/lib/browser/clipboard";
import { downloadTextFile } from "@/src/lib/browser/download";
import { appName } from "@/src/lib/config";
import { formatUtcDateTime } from "@/src/lib/date/format";

const DOWNLOAD_FILE_NAME = "account-recovery-codes.txt";

/** The downloaded file: a heading, when the set was issued, the codes, and how to use them. */
function recoveryCodesFile(codes: readonly string[], issuedAt: string): string {
  const lines = [
    `${appName} recovery codes`,
    `Generated ${formatUtcDateTime(issuedAt)}`,
    "",
    ...codes,
    "",
    "Each code can be used once in place of an authenticator code.",
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
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const copy = async () => {
    const copied = await copyText(codes.join("\n"));
    setNotice(copied ? "Copied to the clipboard." : "Copying failed; select the codes and copy them manually.");
  };

  return (
    <div className="ui:flex ui:flex-col ui:gap-4" role="region" aria-label="New recovery codes">
      {warning && (
        <p role="alert" className="ui:text-sm ui:text-amber-900 ui:dark:text-amber-200">
          {warning}
        </p>
      )}
      <p className="ui:text-sm ui:text-muted-foreground">
        These codes are shown only now. Each one replaces an authenticator code once when signing in; you still
        need your password.
      </p>
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
          Copy all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => downloadTextFile(DOWNLOAD_FILE_NAME, recoveryCodesFile(codes, issuedAt))}
        >
          <DownloadIcon aria-hidden="true" />
          Download .txt
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
          I have saved these codes in a safe place.
        </Label>
      </div>
      <div className="ui:flex ui:justify-end">
        <Button type="button" size="sm" disabled={!saved} onClick={onAcknowledge}>
          Done
        </Button>
      </div>
    </div>
  );
}
