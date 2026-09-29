import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { listEmailLogRows } from "@/app/(LogsModule)/admin/_/db/email/list";
import { resolveTimeRange } from "@/app/(LogsModule)/admin/_/queryState";
import { emailLogsQuerySchema } from "@/app/(LogsModule)/admin/_/schema";
import type { EmailLogsPage } from "@/app/(LogsModule)/admin/_/types";
import { toListItem } from "./projection";

/**
 * The email list read. Page access (`logsRoutes.emailLogs`) is necessary
 * but not sufficient: the read is admin-only on its own. `roles` goes
 * through the shared role parser, so a composite role containing `admin`
 * passes and a moderator or user is answered NOT_FOUND, as if the read did
 * not exist. Not MCP-eligible, no step-up. Viewing a log records nothing.
 */
export const listEmailLogsOperation = defineAction({
  name: "logs.email.list",
  schema: emailLogsQuerySchema,
  roles: ["admin"],
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, query): Promise<EmailLogsPage> => {
    // One instant for the whole read: every relative range is measured from it.
    const asOf = new Date();
    const range = resolveTimeRange(query, asOf);

    const { rows, total, page } = await listEmailLogRows(ctx, {
      q: query.q,
      startedFrom: range.from,
      startedBefore: range.until,
      status: query.status,
      recipient: query.recipient,
      userId: query.userId,
      sort: query.sort,
      direction: query.direction,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: rows.map(toListItem),
      total,
      page,
      pageSize: query.pageSize,
      query: { ...query, page },
      asOf: asOf.toISOString(),
      range: { from: range.from?.toISOString() ?? null, until: range.until?.toISOString() ?? null },
    };
  },
});
