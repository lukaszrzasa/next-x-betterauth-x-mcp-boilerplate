import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { findUserDetailRow } from "@/app/(AuthModule)/admin/_/db/users/userDetail";
import { userTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";
import { requireRootUserId } from "./authorizeTarget";
import { toDetail } from "./projection";

/**
 * The detail read, with its own permission: a role that may only list
 * cannot inspect. Resolves to `null` for an unknown ID; the page turns that
 * into not-found after authorization.
 */
export const getUserOperation = defineAction({
  name: "users.get",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: "user.get",
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<UserDetail | null> => {
    const asOf = new Date();
    const row = await findUserDetailRow(ctx, input.userId);
    if (!row) return null;
    return toDetail(ctx, row, await requireRootUserId(ctx), asOf);
  },
});
