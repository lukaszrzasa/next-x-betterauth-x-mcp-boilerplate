import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { revokeCurrentUserSessions } from "@/src/lib/auth/userSessionEffects";
import { userTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import { attemptEffect, conclude } from "@/app/(AuthModule)/admin/_/services/effects";
import { logged, sessionsRevoked } from "@/app/(AuthModule)/admin/_/services/staffLog";
import type { FailedEffect, UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { authorizeTargetAction } from "./authorizeTarget";

/**
 * Signs a user out everywhere: the sessions that exist now. Idempotent, and
 * never a ban: a fresh sign-in afterwards is allowed.
 */
export const revokeUserSessionsOperation = defineAction({
  name: "users.revokeSessions",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "session.revoke"],
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    const { target } = await authorizeTargetAction(ctx, input.userId, "revokeSessions");

    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-revocation", () => revokeCurrentUserSessions(target.id), failed);

    const outcome = conclude(target.id, false, failed, { selfSignedOut: target.id === ctx.user.id });
    // Only a confirmed sign-out is an action that happened.
    return logged(ctx, outcome, failed.length === 0 ? sessionsRevoked(target) : undefined);
  },
});
