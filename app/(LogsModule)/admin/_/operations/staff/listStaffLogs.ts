import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { toStaffLogBlockViews } from "@/app/(LogsModule)/_/staffLog/schema";
import { listStaffLogRows, type StaffLogRow } from "@/app/(LogsModule)/admin/_/db/staff/list";
import { resolveTimeRange } from "@/app/(LogsModule)/admin/_/queryState";
import { staffLogsQuerySchema } from "@/app/(LogsModule)/admin/_/schema";
import type { StaffLogItem, StaffLogsPage } from "@/app/(LogsModule)/admin/_/types";

/**
 * The staff log read. It serves the list page and every embedded widget:
 * the same read, the same rule. Admin-only on its own (a composite role
 * containing `admin` passes; a moderator or user is answered NOT_FOUND),
 * not MCP-eligible, no step-up. Viewing a log records nothing.
 */
export const listStaffLogsOperation = defineAction({
  name: "logs.staff.list",
  schema: staffLogsQuerySchema,
  roles: ["admin"],
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, query): Promise<StaffLogsPage> => {
    // One instant for the whole read: every relative range is measured from it.
    const asOf = new Date();
    const range = resolveTimeRange(query, asOf);

    const { rows, total, page } = await listStaffLogRows(ctx, {
      q: query.q,
      createdFrom: range.from,
      createdBefore: range.until,
      actorId: query.actorId,
      actions: query.actions,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: rows.map(toItem),
      total,
      page,
      pageSize: query.pageSize,
      query: { ...query, page },
      asOf: asOf.toISOString(),
      range: { from: range.from?.toISOString() ?? null, until: range.until?.toISOString() ?? null },
    };
  },
});

/**
 * The stored blocks are decoded tolerantly: one this release cannot read
 * becomes a placeholder in its place, and its content is not repeated.
 */
function toItem(row: StaffLogRow): StaffLogItem {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actor: { id: row.actorId, name: row.actorName },
    action: row.action,
    resource: { type: row.resourceType, id: row.resourceId },
    message: toStaffLogBlockViews(row.message),
  };
}
