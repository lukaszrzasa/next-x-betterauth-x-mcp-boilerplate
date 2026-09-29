import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { roleNames } from "@/src/lib/auth/permissions";
import type { UserListRow } from "@/app/(AuthModule)/admin/_/db/users/listUsers";
import type { UserDetailRow } from "@/app/(AuthModule)/admin/_/db/users/userDetail";
import { effectiveAccessStatus, evaluateUserAction } from "@/app/(AuthModule)/admin/_/policy";
import {
  USER_ACTIONS,
  type UserAction,
  type UserActionCapability,
  type UserDetail,
  type UserListItem,
} from "@/app/(AuthModule)/admin/_/types";

/**
 * Rows to DTOs. One `asOf` instant per read drives both the SQL ban filter
 * and the projected status.
 */

export function toListItem(row: UserListRow, asOf: Date): UserListItem {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image ?? null,
    roles: roleNames(row.role),
    emailVerified: row.emailVerified === true,
    accessStatus: effectiveAccessStatus(row, asOf),
    banExpires: row.banExpires ? row.banExpires.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The detail, with what this actor may do to this account: presentation only, every write decides again. */
export function toDetail(ctx: AuthedCtx, row: UserDetailRow, rootUserId: string, asOf: Date): UserDetail {
  const item = toListItem(row, asOf);
  const target = {
    id: row.id,
    role: row.role,
    emailVerified: item.emailVerified,
    accessStatus: item.accessStatus,
  };
  const actor = { id: ctx.user.id, role: ctx.user.role };
  const capabilities = Object.fromEntries(
    USER_ACTIONS.map((action) => [action, evaluateUserAction(actor, target, rootUserId, action)]),
  ) as Record<UserAction, UserActionCapability>;

  const banned = item.accessStatus !== "active";
  return {
    ...item,
    updatedAt: row.updatedAt.toISOString(),
    banReason: banned && row.banReason ? row.banReason : null,
    twoFactorRequired: row.twoFactorRequired === true,
    twoFactorEnabled: row.twoFactorEnabled === true,
    isRoot: row.id === rootUserId,
    isSelf: row.id === ctx.user.id,
    capabilities,
  };
}
