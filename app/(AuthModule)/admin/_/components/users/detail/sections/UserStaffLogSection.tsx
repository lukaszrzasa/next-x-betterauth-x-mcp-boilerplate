"use client";

import { ScrollTextIcon } from "lucide-react";
import { DetailSection } from "@/src/components/detail/DetailSection";
import {
  StaffLogWidget,
  useCanViewStaffLog,
} from "@/app/(LogsModule)/admin/_/components/staffLogs/StaffLogWidget";

/** What staff did to this account. Absent, heading included, for viewers who may not read the staff log. */
export function UserStaffLogSection({ userId, revision }: { userId: string; revision: string }) {
  if (!useCanViewStaffLog()) return null;
  return (
    <DetailSection title="Staff log" description="What staff changed on this account, newest first." icon={ScrollTextIcon}>
      <StaffLogWidget resourceId={userId} revision={revision} label="Staff actions on this user" />
    </DetailSection>
  );
}
