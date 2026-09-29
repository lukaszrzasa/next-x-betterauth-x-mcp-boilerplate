import "server-only";

import { and, asc, count, desc, eq, gte, lt, sql, type InferSelectModel, type SQL } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { lastPage } from "@/src/lib/data-table/queryState";
import { emailLog } from "@/src/lib/db";
import { containsPattern } from "@/src/lib/db/like";
import { withReadSnapshot } from "@/src/lib/db/readSnapshot";
import type { EmailLogsQuery } from "@/app/(LogsModule)/admin/_/types";

/**
 * The email list read. An explicit projection: the body, the diagnostics,
 * the record key and the digests are never selected. Nothing here joins or
 * looks up another module's tables; recipient and requester names are the
 * stored snapshots.
 */

export const listColumns = {
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

export type EmailLogListRow = Pick<InferSelectModel<typeof emailLog>, keyof typeof listColumns>;

/** What to read, as instants and values: the caller has already resolved the range. */
export type EmailLogCriteria = Pick<
  EmailLogsQuery,
  "q" | "status" | "recipient" | "userId" | "sort" | "direction" | "page" | "pageSize"
> & {
  /** Started at or after this instant; null is unbounded. */
  startedFrom: Date | null;
  /** Started before this instant, exclusive; null is unbounded. */
  startedBefore: Date | null;
};

/** Literal, case-insensitive substring of the safe metadata document (subject and recipient). */
function searchPredicate(q: string): SQL | undefined {
  return q ? sql`${emailLog.searchText} ILIKE ${containsPattern(q)} ESCAPE '\\'` : undefined;
}

/** Filters combine with AND; an empty value is "no filter". */
function wherePredicate(criteria: EmailLogCriteria): SQL | undefined {
  return and(
    searchPredicate(criteria.q),
    criteria.startedFrom ? gte(emailLog.startedAt, criteria.startedFrom) : undefined,
    criteria.startedBefore ? lt(emailLog.startedAt, criteria.startedBefore) : undefined,
    criteria.status === "all" ? undefined : eq(emailLog.status, criteria.status),
    criteria.recipient ? eq(emailLog.recipientEmail, criteria.recipient) : undefined,
    criteria.userId ? eq(emailLog.recipientUserId, criteria.userId) : undefined,
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

function orderBy(criteria: EmailLogCriteria): SQL[] {
  const direction = criteria.direction === "asc" ? asc : desc;
  return [direction(SORT_EXPRESSIONS[criteria.sort]()), direction(emailLog.id)];
}

export type EmailLogRowsPage = {
  rows: EmailLogListRow[];
  total: number;
  /** 1-based and clamped to the actual final page. */
  page: number;
};

/** One page of rows with the total it belongs to. */
export async function listEmailLogRows(_ctx: AuthedCtx, criteria: EmailLogCriteria): Promise<EmailLogRowsPage> {
  const where = wherePredicate(criteria);

  // Count and page share one snapshot, so the range label matches the rows.
  return withReadSnapshot(async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(emailLog).where(where);

    // Clamp before computing the offset: page 1 for an empty result.
    const page = Math.min(criteria.page, lastPage(total, criteria.pageSize));
    const rows = await tx
      .select(listColumns)
      .from(emailLog)
      .where(where)
      .orderBy(...orderBy(criteria))
      .limit(criteria.pageSize)
      .offset((page - 1) * criteria.pageSize);

    return { rows, total, page };
  });
}
