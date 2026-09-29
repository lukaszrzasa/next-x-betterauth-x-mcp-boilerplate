import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { listUserRows } from "@/app/(AuthModule)/admin/_/db/users/listUsers";
import { usersQuerySchema } from "@/app/(AuthModule)/admin/_/schema";
import type { UsersPage } from "@/app/(AuthModule)/admin/_/types";
import { toListItem } from "./projection";

/**
 * The list read. Page access (`authRoutes.adminUsers`) is necessary but not
 * sufficient: the read re-checks staff membership and its own permission,
 * so a role that may only inspect cannot list. Not MCP-eligible; the
 * existing MCP lookup remains separate.
 */
export const listUsersOperation = defineAction({
  name: "users.list",
  schema: usersQuerySchema,
  roles: STAFF_ROLES,
  permissions: "user.list",
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, query): Promise<UsersPage> => {
    const asOf = new Date();
    const { rows, total, page } = await listUserRows(ctx, query, asOf);
    return {
      items: rows.map((row) => toListItem(row, asOf)),
      total,
      page,
      pageSize: query.pageSize,
      query: { ...query, page },
    };
  },
});
