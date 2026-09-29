import "server-only";

import { and, count, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { lastPage } from "@/src/lib/data-table/queryState";
import { staffLog, user } from "@/src/lib/db";
import { containsPattern } from "@/src/lib/db/like";
import { withReadSnapshot } from "@/src/lib/db/readSnapshot";
import type { StaffLogsQuery } from "@/app/(LogsModule)/admin/_/types";

/**
 * The staff log read, for the list page and every embedded widget. The only
 * join is to the acting user, for their current name; the resource an entry
 * points at is never looked up. Newest first.
 */

/** What to read, as instants and values: the caller has already resolved the range. */
export type StaffLogCriteria = Pick<
  StaffLogsQuery,
  "q" | "actorId" | "actions" | "resourceType" | "resourceId" | "page" | "pageSize"
> & {
  /** Created at or after this instant; null is unbounded. */
  createdFrom: Date | null;
  /** Created before this instant, exclusive; null is unbounded. */
  createdBefore: Date | null;
};

export type StaffLogRow = {
  id: string;
  createdAt: Date;
  actorId: string;
  /** The staff member's name as it is now. */
  actorName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  /** The blocks as stored, not yet decoded. */
  message: unknown;
};

export type StaffLogRowsPage = {
  rows: StaffLogRow[];
  total: number;
  /** 1-based and clamped to the actual final page. */
  page: number;
};

/** Filters combine with AND; an empty value is "no filter". */
function wherePredicate(criteria: StaffLogCriteria): SQL | undefined {
  return and(
    criteria.q ? sql`${staffLog.messageText} ILIKE ${containsPattern(criteria.q)} ESCAPE '\\'` : undefined,
    criteria.createdFrom ? gte(staffLog.createdAt, criteria.createdFrom) : undefined,
    criteria.createdBefore ? lt(staffLog.createdAt, criteria.createdBefore) : undefined,
    criteria.actorId ? eq(staffLog.actorId, criteria.actorId) : undefined,
    criteria.actions.length > 0 ? inArray(staffLog.action, criteria.actions) : undefined,
    criteria.resourceType ? eq(staffLog.resourceType, criteria.resourceType) : undefined,
    criteria.resourceId ? eq(staffLog.resourceId, criteria.resourceId) : undefined,
  );
}

/** One page of entries with the total it belongs to. */
export async function listStaffLogRows(_ctx: AuthedCtx, criteria: StaffLogCriteria): Promise<StaffLogRowsPage> {
  const where = wherePredicate(criteria);

  // Count and page share one snapshot, so the range label matches the rows.
  return withReadSnapshot(async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(staffLog).where(where);

    // Clamp before computing the offset: page 1 for an empty result.
    const page = Math.min(criteria.page, lastPage(total, criteria.pageSize));
    const rows = await tx
      .select({
        id: staffLog.id,
        createdAt: staffLog.createdAt,
        actorId: staffLog.actorId,
        actorName: user.name,
        action: staffLog.action,
        resourceType: staffLog.resourceType,
        resourceId: staffLog.resourceId,
        message: staffLog.message,
      })
      .from(staffLog)
      .innerJoin(user, eq(user.id, staffLog.actorId))
      .where(where)
      .orderBy(desc(staffLog.createdAt), desc(staffLog.id))
      .limit(criteria.pageSize)
      .offset((page - 1) * criteria.pageSize);

    return { rows, total, page };
  });
}
