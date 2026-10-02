"use client";

import { InfoIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CopyButton } from "@/src/components/actions/CopyButton";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { toIsoInstant } from "@/src/lib/date/format";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";

function Timestamp({ value }: { value: string }) {
  const format = useFormatter();
  return <time dateTime={toIsoInstant(value)}>{format.dateTime(new Date(value), "dateTime")}</time>;
}

export function UserMetadataSection({ user }: { user: UserDetail }) {
  const t = useTranslations("authAdmin.detail.metadata");
  return (
    <DetailSection title={t("title")} icon={InfoIcon}>
      <div>
        <DetailRow label={t("userId")} control={<CopyButton value={user.id} label={t("copyUserId")} />}>
          <code className="ui:font-mono ui:text-xs ui:break-all">{user.id}</code>
        </DetailRow>
        <DetailRow label={t("created")}>
          <Timestamp value={user.createdAt} />
        </DetailRow>
        <DetailRow label={t("lastUpdated")}>
          <Timestamp value={user.updatedAt} />
        </DetailRow>
        <DetailRow label={t("rootDesignation")}>{user.isRoot ? t("rootYes") : t("rootNo")}</DetailRow>
      </div>
    </DetailSection>
  );
}
