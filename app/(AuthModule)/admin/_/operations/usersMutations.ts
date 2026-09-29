import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import {
  banUser,
  retryBanSessions,
  retryUnbanSessionRefresh,
  unbanUser,
} from "@/app/(AuthModule)/admin/_/db/users/bans";
import {
  retryEmailChangeEffects,
  retryNameSessionRefresh,
  updateUserEmail,
  updateUserName,
} from "@/app/(AuthModule)/admin/_/db/users/profile";
import { revokeUserSessions } from "@/app/(AuthModule)/admin/_/db/users/sessions";
import {
  banUserSchema,
  updateUserEmailSchema,
  updateUserNameSchema,
  userTargetSchema,
} from "@/app/(AuthModule)/admin/_/schema";

/**
 * The account mutations. `roles` admits staff (anyone else gets NOT_FOUND),
 * `permissions` decide what the role may do (combined with AND), and the
 * target rules run again in the service from fresh data. Nothing here is
 * MCP-eligible. Only the email change and applying/replacing a ban - and
 * their effect-recovery twins - require the five-minute step-up.
 */

export const updateUserNameOperation = defineAction({
  name: "users.updateName",
  schema: updateUserNameSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.update"],
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => updateUserName(ctx, input),
});

export const updateUserEmailOperation = defineAction({
  name: "users.updateEmail",
  schema: updateUserEmailSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.update", "user.set-email"],
  mcpAllowed: false,
  stepUp: "five_minutes",
  handler: (ctx, input) => updateUserEmail(ctx, input),
});

export const revokeUserSessionsOperation = defineAction({
  name: "users.revokeSessions",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "session.revoke"],
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => revokeUserSessions(ctx, input),
});

export const banUserOperation = defineAction({
  name: "users.ban",
  schema: banUserSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.ban"],
  mcpAllowed: false,
  stepUp: "five_minutes",
  handler: (ctx, input) => banUser(ctx, input),
});

export const unbanUserOperation = defineAction({
  name: "users.unban",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.ban"],
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => unbanUser(ctx, input),
});

// ---------------------------------------------------------------------------
// Effect recovery after a partial outcome. Separate definitions because a
// definition's policy is static: each carries exactly the permissions and
// step-up of the operation it finishes, re-reads the current target, and
// never replays values from the request that failed.
// ---------------------------------------------------------------------------

export const retryEmailChangeEffectsOperation = defineAction({
  name: "users.retryEmailChangeEffects",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.update", "user.set-email"],
  mcpAllowed: false,
  stepUp: "five_minutes",
  handler: (ctx, input) => retryEmailChangeEffects(ctx, input),
});

export const retryBanSessionsOperation = defineAction({
  name: "users.retryBanSessions",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.ban"],
  mcpAllowed: false,
  stepUp: "five_minutes",
  handler: (ctx, input) => retryBanSessions(ctx, input),
});

export const retryNameSessionRefreshOperation = defineAction({
  name: "users.retryNameSessionRefresh",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.update"],
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => retryNameSessionRefresh(ctx, input),
});

export const retryUnbanSessionRefreshOperation = defineAction({
  name: "users.retryUnbanSessionRefresh",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.ban"],
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => retryUnbanSessionRefresh(ctx, input),
});
