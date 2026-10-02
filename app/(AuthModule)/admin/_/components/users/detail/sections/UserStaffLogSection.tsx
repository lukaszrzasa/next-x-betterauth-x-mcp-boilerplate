"use client";

import { ScrollTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { DetailSection } from "@/src/components/detail/DetailSection";
import {
  StaffLogWidget,
  useCanViewStaffLog,
} from "@/app/(LogsModule)/admin/_/components/staffLogs/StaffLogWidget";
import { useAccountChanges } from "@/app/(AuthModule)/admin/_/hooks/useAccountRefresh";

/** What staff did to this account. Absent, heading included, for viewers who may not read the staff log. */
export function UserStaffLogSection({ userId }: { userId: string }) {
  const t = useTranslations("authAdmin.detail.staffLog");
  const changes = useAccountChanges();
  if (!useCanViewStaffLog()) return null;
  return (
    <DetailSection title={t("title")} description={t("description")} icon={ScrollTextIcon}>
      <StaffLogWidget resourceId={userId} revision={changes} label={t("widgetLabel")} />
    </DetailSection>
  );
}
