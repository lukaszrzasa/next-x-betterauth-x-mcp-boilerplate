import "server-only";

import { and, asc, count, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { staffLog, user } from "@/src/lib/db";
import { containsPattern } from "@/src/lib/db/like";
import { withReadSnapshot } from "@/src/lib/db/readSnapshot";
import { lastPage } from "@/src/lib/data-table/queryState";
import { toStaffLogBlockViews } from "@/app/(LogsModule)/_/staffLog/schema";
import { resolveTimeRange } from "@/app/(LogsModule)/admin/_/queryState";
import type {
  StaffLogFilterOptions,
  StaffLogItem,
  StaffLogsPage,
  StaffLogsQuery,
} from "@/app/(LogsModule)/admin/_/types";

/**
 * Read side of the staff log, for the list page and every embedded widget.
 * The only join is to the acting user, for their current name; the resource
 * an entry points at is never looked up, and the message is rendered from
 * its own blocks. Newest first.
 *
 * One repeatable-read, read-only snapshot with a 5-second statement timeout
 * per read: the count and the page it describes always agree.
 */

/** Filters combine with AND; an empty value is "no filter". */
function wherePredicate(query: StaffLogsQuery, asOf: Date): SQL | undefined {
  const range = resolveTimeRange(query, asOf);
  return and(
    query.q ? sql`${staffLog.messageText} ILIKE ${containsPattern(query.q)} ESCAPE '\\'` : undefined,
    range.from ? gte(staffLog.createdAt, range.from) : undefined,
    range.until ? lt(staffLog.createdAt, range.until) : undefined,
    query.actorId ? eq(staffLog.actorId, query.actorId) : undefined,
    query.actions.length > 0 ? inArray(staffLog.action, query.actions) : undefined,
    query.resourceType ? eq(staffLog.resourceType, query.resourceType) : undefined,
    query.resourceId ? eq(staffLog.resourceId, query.resourceId) : undefined,
  );
}

export async function listStaffLogs(_ctx: AuthedCtx, query: StaffLogsQuery): Promise<StaffLogsPage> {
  const asOf = new Date();
  const where = wherePredicate(query, asOf);
  const range = resolveTimeRange(query, asOf);

  return withReadSnapshot(async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(staffLog).where(where);
    // Clamp before computing the offset: page 1 for an empty result.
    const page = Math.min(query.page, lastPage(total, query.pageSize));
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
      .limit(query.pageSize)
      .offset((page - 1) * query.pageSize);

    return {
      items: rows.map(
        (row): StaffLogItem => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          actor: { id: row.actorId, name: row.actorName },
          action: row.action,
          resource: { type: row.resourceType, id: row.resourceId },
          message: toStaffLogBlockViews(row.message),
        }),
      ),
      total,
      page,
      pageSize: query.pageSize,
      query: { ...query, page },
      asOf: asOf.toISOString(),
      range: { from: range.from?.toISOString() ?? null, until: range.until?.toISOString() ?? null },
    };
  });
}

/** The staff members and actions the log contains, for the list's two selects. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- every service entry takes the context
export async function listStaffLogFilterOptions(_ctx: AuthedCtx): Promise<StaffLogFilterOptions> {
  return withReadSnapshot(async (tx) => {
    const actors = await tx
      .selectDistinct({ id: user.id, name: user.name })
      .from(staffLog)
      .innerJoin(user, eq(user.id, staffLog.actorId))
      .orderBy(asc(user.name), asc(user.id));
    const actions = await tx.selectDistinct({ action: staffLog.action }).from(staffLog).orderBy(asc(staffLog.action));
    return { actors, actions: actions.map((row) => row.action) };
  });
}
