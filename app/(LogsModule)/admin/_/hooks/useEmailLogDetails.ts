"use client";

import { getEmailLogAction } from "@/app/(LogsModule)/admin/_/actions";
import type { EmailLogDetail } from "@/app/(LogsModule)/admin/_/types";
import { useLogDetail, type LogDetailState } from "./useLogDetail";

/** One email attempt and one page of its chain; mount one per (log, attempts page). */
export function useEmailLogDetails(id: string, attemptsPage: number): LogDetailState<EmailLogDetail> {
  return useLogDetail(getEmailLogAction, { id, attemptsPage });
}
