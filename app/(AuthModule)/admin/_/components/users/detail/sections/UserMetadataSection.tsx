"use client";

import { InfoIcon } from "lucide-react";
import { CopyButton } from "@/src/components/actions/CopyButton";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { formatUtcDateTime, toIsoInstant } from "@/src/lib/date/format";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";

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
