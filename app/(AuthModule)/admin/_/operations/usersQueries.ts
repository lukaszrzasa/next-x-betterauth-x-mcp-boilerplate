import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { getUserDetail, listUsers } from "@/app/(AuthModule)/admin/_/db/users/reads";
import { userTargetSchema, usersQuerySchema } from "@/app/(AuthModule)/admin/_/schema";

/**
 * The two reads. Page access (`authRoutes.adminUsers` / `adminUser`) is
 * necessary but not sufficient: each read re-checks staff membership and its
 * own permission, so a page that only lists cannot fetch a detail and vice
 * versa. Neither is MCP-eligible; the existing MCP lookup remains separate.
 */

export const listUsersOperation = defineAction({
  name: "users.list",
  schema: usersQuerySchema,
  roles: STAFF_ROLES,
  permissions: "user.list",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => listUsers(ctx, input),
});

/** Resolves to `null` for an unknown ID; the page turns that into not-found after authorization. */
export const getUserOperation = defineAction({
  name: "users.get",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: "user.get",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => getUserDetail(ctx, input.userId),
});
