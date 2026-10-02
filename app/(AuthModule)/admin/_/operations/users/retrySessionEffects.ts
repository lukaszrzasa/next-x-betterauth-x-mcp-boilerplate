import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { refreshCommittedUserSessions, revokeCurrentUserSessions } from "@/src/lib/auth/userSessionEffects";
import { isEffectivelyBanned } from "@/app/(AuthModule)/admin/_/policy";
import { userTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import { attemptEffect, conclude } from "@/app/(AuthModule)/admin/_/services/effects";
import { logged, sessionsRetried } from "@/app/(AuthModule)/admin/_/services/staffLog";
import type { FailedEffect, UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { authorizeTargetAction, type Target } from "./authorizeTarget";

/**
 * Recovery of a single session effect after a partial outcome. Separate
 * definitions because a definition's policy is static: each carries exactly
 * the permissions and step-up of the operation it finishes. Each checks the
 * target as it is now and repeats the effect; none writes the account or
 * replays a value from the request that failed.
 */

type SessionEffect = "session-revocation" | "session-refresh";

const EFFECTS: Record<SessionEffect, { run: (userId: string) => Promise<unknown>; label: "session sign-out" | "session refresh" }> = {
  "session-revocation": { run: revokeCurrentUserSessions, label: "session sign-out" },
  "session-refresh": { run: refreshCommittedUserSessions, label: "session refresh" },
};

async function retryEffect(ctx: AuthedCtx, target: Target, effect: SessionEffect): Promise<UserMutationOutcome> {
  const failed: FailedEffect[] = [];
  await attemptEffect(ctx, effect, () => EFFECTS[effect].run(target.id), failed);

  const outcome = conclude(target.id, false, failed);
  return logged(ctx, outcome, failed.length === 0 ? sessionsRetried(target, EFFECTS[effect].label) : undefined);
}

/** After a partial ban: revoke sessions; expiry and reason are untouched. */
export const retryBanSessionsOperation = defineAction({
  name: "users.retryBanSessions",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.ban"],
  mcpAllowed: false,
  stepUp: "five_minutes",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    const { target } = await authorizeTargetAction(ctx, input.userId, "ban");
    if (!isEffectivelyBanned(target.accessStatus)) {
      throw new ActionError("FORBIDDEN", {
        message: { key: "authAdmin.errors.notBannedNothingToFinish" },
        data: { reason: "not-banned" },
      });
    }
    return retryEffect(ctx, target, "session-revocation");
  },
});

/** After a partial rename: refresh the cached user copies. */
export const retryNameSessionRefreshOperation = defineAction({
  name: "users.retryNameSessionRefresh",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.update"],
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    const { target } = await authorizeTargetAction(ctx, input.userId, "updateName");
    return retryEffect(ctx, target, "session-refresh");
  },
});

/** After a partial unban: refresh the cached user copies of the account that is active again. */
export const retryUnbanSessionRefreshOperation = defineAction({
  name: "users.retryUnbanSessionRefresh",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.ban"],
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    const { target } = await authorizeTargetAction(ctx, input.userId, "unban");
    if (target.accessStatus !== "active") {
      throw new ActionError("FORBIDDEN", {
        message: { key: "authAdmin.errors.stillBanned" },
        data: { reason: "banned" },
      });
    }
    return retryEffect(ctx, target, "session-refresh");
  },
});
