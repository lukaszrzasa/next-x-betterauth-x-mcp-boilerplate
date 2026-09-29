import type { EmailAttemptRow, EmailLogDetailRow } from "@/app/(LogsModule)/admin/_/db/email/detail";
import type { EmailLogListRow } from "@/app/(LogsModule)/admin/_/db/email/list";
import type { ActorView, EmailAttemptItem, EmailLogDetail, EmailLogListItem } from "@/app/(LogsModule)/admin/_/types";

/**
 * Selected email log rows as what crosses to the browser: ISO 8601 UTC
 * instants, explicit nulls and the requester as one view. Every field is
 * named; a row is never spread, so a column added to a projection does not
 * leave the server by accident.
 */

/** A requester snapshot as stored; `anonymous` never carries an ID. */
export function toActorView(kind: string, id: string | null, label: string): ActorView {
  return { kind, id: kind === "anonymous" ? null : id, label };
}

export function toListItem(row: EmailLogListRow): EmailLogListItem {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    recipientEmail: row.recipientEmail,
    recipientUserId: row.recipientUserId,
    recipientLabel: row.recipientLabel,
    subject: row.subject,
    status: row.status,
    attemptNumber: row.attemptNumber,
    originalLogId: row.originalLogId,
    requester: toActorView(row.requesterKind, row.requesterId, row.requesterLabel),
  };
}

export function toAttemptItem(row: EmailAttemptRow): EmailAttemptItem {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    status: row.status,
    attemptNumber: row.attemptNumber,
    requester: toActorView(row.requesterKind, row.requesterId, row.requesterLabel),
  };
}

/** The attempt without its chain. `completedAt` stays null for a row still `sending`. */
export function toDetail(row: EmailLogDetailRow): Omit<EmailLogDetail, "attempts"> {
  return {
    ...toListItem(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    contentText: row.contentText,
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    previousAttemptId: row.previousAttemptId,
    requestId: row.requestId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    stackTrace: row.stackTrace,
    redactionVersion: row.redactionVersion,
  };
}
