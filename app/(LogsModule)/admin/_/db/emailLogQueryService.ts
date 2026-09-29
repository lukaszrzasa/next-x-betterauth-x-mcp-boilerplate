import "server-only";

import { and, asc, count, desc, eq, gte, lt, or, sql, type InferSelectModel, type SQL } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { emailLog } from "@/src/lib/db";
import { containsPattern } from "@/src/lib/db/like";
import { withReadSnapshot } from "@/src/lib/db/readSnapshot";
import { lastPage } from "@/src/lib/data-table/queryState";
import { resolveTimeRange } from "@/app/(LogsModule)/admin/_/queryState";
import { EMAIL_ATTEMPTS_PAGE_SIZE, toActorView, type EmailLogDetailSchema } from "@/app/(LogsModule)/admin/_/schema";
import type {
  EmailAttemptItem,
  EmailLogDetail,
  EmailLogListItem,
  EmailLogsPage,
  EmailLogsQuery,
} from "@/app/(LogsModule)/admin/_/types";

/**
 * Read side of the email-log list and dialog. Explicit projections only: the
 * list never selects the body, diagnostics or digests, and the detail never
 * returns the record key or digests. Nothing here joins or looks up another
 * module's tables; recipient and requester names are the stored snapshots.
 *
 * Every read runs in one repeatable-read, read-only snapshot with a 5-second
 * statement timeout: the count and the page it describes (or a record and
 * its attempt chain) always agree.
 */

const listColumns = {
  id: emailLog.id,
  startedAt: emailLog.startedAt,
  recipientEmail: emailLog.recipientEmail,
  recipientUserId: emailLog.recipientUserId,
  recipientLabel: emailLog.recipientLabel,
  subject: emailLog.subject,
  status: emailLog.status,
  attemptNumber: emailLog.attemptNumber,
  originalLogId: emailLog.originalLogId,
  requesterKind: emailLog.requesterKind,
  requesterId: emailLog.requesterId,
  requesterLabel: emailLog.requesterLabel,
};

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

type ListRow = Pick<InferSelectModel<typeof emailLog>, keyof typeof listColumns>;

/** Literal, case-insensitive substring of the safe metadata document (subject and recipient). */
function searchPredicate(q: string): SQL | undefined {
  return q ? sql`${emailLog.searchText} ILIKE ${containsPattern(q)} ESCAPE '\\'` : undefined;
}

/** Filters combine with AND; an empty value is "no filter". */
function wherePredicate(query: EmailLogsQuery, asOf: Date): SQL | undefined {
  const range = resolveTimeRange(query, asOf);
  return and(
    searchPredicate(query.q),
    range.from ? gte(emailLog.startedAt, range.from) : undefined,
    range.until ? lt(emailLog.startedAt, range.until) : undefined,
    query.status === "all" ? undefined : eq(emailLog.status, query.status),
    query.recipient ? eq(emailLog.recipientEmail, query.recipient) : undefined,
    query.userId ? eq(emailLog.recipientUserId, query.userId) : undefined,
  );
}

/**
 * Closed mapping from the sort vocabulary to expressions, then the ID in the
 * same direction as a stable tie-breaker. The recipient column is stored
 * lowercase (a check constraint), so it is its own lowercased form.
 */
const SORT_EXPRESSIONS: Record<EmailLogsQuery["sort"], () => SQL | typeof emailLog.startedAt> = {
  time: () => emailLog.startedAt,
  recipient: () => sql`${emailLog.recipientEmail}`,
  subject: () => sql`lower(${emailLog.subject})`,
};

function orderBy(query: EmailLogsQuery): SQL[] {
  const direction = query.direction === "asc" ? asc : desc;
  return [direction(SORT_EXPRESSIONS[query.sort]()), direction(emailLog.id)];
}

function toListItem(row: ListRow): EmailLogListItem {
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

export async function listEmailLogs(_ctx: AuthedCtx, query: EmailLogsQuery): Promise<EmailLogsPage> {
  const asOf = new Date();
  const where = wherePredicate(query, asOf);
  const range = resolveTimeRange(query, asOf);

  return withReadSnapshot(async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(emailLog).where(where);
    // Clamp before computing the offset: page 1 for an empty result.
    const page = Math.min(query.page, lastPage(total, query.pageSize));
    const rows = await tx
      .select(listColumns)
      .from(emailLog)
      .where(where)
      .orderBy(...orderBy(query))
      .limit(query.pageSize)
      .offset((page - 1) * query.pageSize);

    return {
      items: rows.map(toListItem),
      total,
      page,
      pageSize: query.pageSize,
      query: { ...query, page },
      asOf: asOf.toISOString(),
      range: { from: range.from?.toISOString() ?? null, until: range.until?.toISOString() ?? null },
    };
  });
}

/**
 * One attempt with its chain. The chain is the original attempt plus every
 * retry of it, by attempt number; `attemptsPage` is clamped to the chain in
 * the same snapshot. Null when no such log exists.
 */
export async function getEmailLogDetail(
  _ctx: AuthedCtx,
  input: EmailLogDetailSchema,
): Promise<EmailLogDetail | null> {
  return withReadSnapshot(async (tx) => {
    const [row] = await tx.select(detailColumns).from(emailLog).where(eq(emailLog.id, input.id)).limit(1);
    if (!row) return null;

    const originalId = row.originalLogId ?? row.id;
    const inChain = or(eq(emailLog.id, originalId), eq(emailLog.originalLogId, originalId));
    const [{ total }] = await tx.select({ total: count() }).from(emailLog).where(inChain);
    const page = Math.min(input.attemptsPage, lastPage(total, EMAIL_ATTEMPTS_PAGE_SIZE));
    const attempts = await tx
      .select({
        id: emailLog.id,
        startedAt: emailLog.startedAt,
        status: emailLog.status,
        attemptNumber: emailLog.attemptNumber,
        requesterKind: emailLog.requesterKind,
        requesterId: emailLog.requesterId,
        requesterLabel: emailLog.requesterLabel,
      })
      .from(emailLog)
      .where(inChain)
      .orderBy(asc(emailLog.attemptNumber), asc(emailLog.id))
      .limit(EMAIL_ATTEMPTS_PAGE_SIZE)
      .offset((page - 1) * EMAIL_ATTEMPTS_PAGE_SIZE);

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
      attempts: {
        items: attempts.map(
          (attempt): EmailAttemptItem => ({
            id: attempt.id,
            startedAt: attempt.startedAt.toISOString(),
            status: attempt.status,
            attemptNumber: attempt.attemptNumber,
            requester: toActorView(attempt.requesterKind, attempt.requesterId, attempt.requesterLabel),
          }),
        ),
        page,
        pageSize: EMAIL_ATTEMPTS_PAGE_SIZE,
        total,
      },
    };
  });
}
