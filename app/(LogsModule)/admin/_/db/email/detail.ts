import "server-only";

import { asc, count, eq, or, type InferSelectModel } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { lastPage } from "@/src/lib/data-table/queryState";
import { emailLog } from "@/src/lib/db";
import { withReadSnapshot } from "@/src/lib/db/readSnapshot";
import { listColumns } from "./list";

/**
 * The dialog's read: one attempt and a page of its chain. The record key
 * and both digests are never selected.
 */

const detailColumns = {
  ...listColumns,
  createdAt: emailLog.createdAt,
  updatedAt: emailLog.updatedAt,
  completedAt: emailLog.completedAt,
  contentText: emailLog.contentText,
  provider: emailLog.provider,
  providerMessageId: emailLog.providerMessageId,
  previousAttemptId: emailLog.previousAttemptId,
  requestId: emailLog.requestId,
  errorCode: emailLog.errorCode,
  errorMessage: emailLog.errorMessage,
  stackTrace: emailLog.stackTrace,
  redactionVersion: emailLog.redactionVersion,
};

const attemptColumns = {
  id: emailLog.id,
  startedAt: emailLog.startedAt,
  status: emailLog.status,
  attemptNumber: emailLog.attemptNumber,
  requesterKind: emailLog.requesterKind,
  requesterId: emailLog.requesterId,
  requesterLabel: emailLog.requesterLabel,
};

export type EmailLogDetailRow = Pick<InferSelectModel<typeof emailLog>, keyof typeof detailColumns>;
export type EmailAttemptRow = Pick<InferSelectModel<typeof emailLog>, keyof typeof attemptColumns>;

export type EmailLogWithAttempts = {
  row: EmailLogDetailRow;
  attempts: {
    rows: EmailAttemptRow[];
    total: number;
    /** 1-based and clamped to the chain's final page. */
    page: number;
  };
};

/**
 * One attempt with its chain, from one snapshot. The chain is the original
 * attempt plus every retry of it, by attempt number. `null` when no such
 * log exists.
 */
export async function findEmailLogWithAttempts(
  _ctx: AuthedCtx,
  target: { id: string; attemptsPage: number; attemptsPageSize: number },
): Promise<EmailLogWithAttempts | null> {
  return withReadSnapshot(async (tx) => {
    const [row] = await tx.select(detailColumns).from(emailLog).where(eq(emailLog.id, target.id)).limit(1);
    if (!row) return null;

    const originalId = row.originalLogId ?? row.id;
    const inChain = or(eq(emailLog.id, originalId), eq(emailLog.originalLogId, originalId));
    const [{ total }] = await tx.select({ total: count() }).from(emailLog).where(inChain);

    // Clamp before computing the offset.
    const page = Math.min(target.attemptsPage, lastPage(total, target.attemptsPageSize));
    const rows = await tx
      .select(attemptColumns)
      .from(emailLog)
      .where(inChain)
      .orderBy(asc(emailLog.attemptNumber), asc(emailLog.id))
      .limit(target.attemptsPageSize)
      .offset((page - 1) * target.attemptsPageSize);

    return { row, attempts: { rows, total, page } };
  });
}
