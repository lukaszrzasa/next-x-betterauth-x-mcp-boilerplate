"use client";

import { ScrollTextIcon } from "lucide-react";
import { DetailSection } from "@/src/components/detail/DetailSection";
import {
  StaffLogWidget,
  useCanViewStaffLog,
} from "@/app/(LogsModule)/admin/_/components/staffLogs/StaffLogWidget";
import { useAccountChanges } from "@/app/(AuthModule)/admin/_/hooks/useAccountRefresh";

/** What staff did to this account. Absent, heading included, for viewers who may not read the staff log. */
export function UserStaffLogSection({ userId }: { userId: string }) {
  const changes = useAccountChanges();
  if (!useCanViewStaffLog()) return null;
  return (
    <DetailSection title="Staff log" description="What staff changed on this account, newest first." icon={ScrollTextIcon}>
      <StaffLogWidget resourceId={userId} revision={changes} label="Staff actions on this user" />
    </DetailSection>
  );
}
