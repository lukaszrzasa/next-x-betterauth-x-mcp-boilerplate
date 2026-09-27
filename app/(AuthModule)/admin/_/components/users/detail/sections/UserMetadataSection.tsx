"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, InfoIcon } from "lucide-react";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { Button } from "@/src/components/ui/button";
import { copyText } from "@/src/lib/browser/clipboard";
import { formatUtcDateTime, toIsoInstant } from "@/src/lib/date/format";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={copied ? "Copied" : label}
      onClick={async () => {
        // When the clipboard is unavailable the ID remains selectable.
        if (!(await copyText(value))) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 2_000);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

function Timestamp({ value }: { value: string }) {
  return <time dateTime={toIsoInstant(value)}>{formatUtcDateTime(value)}</time>;
}

export function UserMetadataSection({ user }: { user: UserDetail }) {
  return (
    <DetailSection title="Account details" icon={InfoIcon}>
      <div>
        <DetailRow label="User ID" control={<CopyButton value={user.id} label="Copy user ID" />}>
          <code className="ui:font-mono ui:text-xs ui:break-all">{user.id}</code>
        </DetailRow>
        <DetailRow label="Created">
          <Timestamp value={user.createdAt} />
        </DetailRow>
        <DetailRow label="Last updated">
          <Timestamp value={user.updatedAt} />
        </DetailRow>
        <DetailRow label="Root designation">
          {user.isRoot ? "Yes, the installation's root account" : "No"}
        </DetailRow>
      </div>
    </DetailSection>
  );
}
