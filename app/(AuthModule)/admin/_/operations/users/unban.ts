import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { refreshCommittedUserSessions } from "@/src/lib/auth/userSessionEffects";
import { userTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import { attemptEffect, conclude, unchanged } from "@/app/(AuthModule)/admin/_/services/effects";
import { logged, unbanned } from "@/app/(AuthModule)/admin/_/services/staffLog";
import type { FailedEffect, UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { authorizeTargetAction } from "./authorizeTarget";
import { confirmCommitted } from "./confirmCommitted";

/**
 * Lifts a ban; an account that is not banned is left as it is. No step-up.
 * Overlapping administrative commands are ordinary last-writer-wins.
 */
export const unbanUserOperation = defineAction({
  name: "users.unban",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.ban"],
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    const { target, unchanged: alreadyActive } = await authorizeTargetAction(ctx, input.userId, "unban");
    if (alreadyActive) return unchanged(target.id);

    try {
      await auth.api.unbanUser({ body: { userId: target.id }, headers: ctx.getRequestHeaders() });
    } catch (error) {
      await confirmCommitted(ctx, target.id, (current) => current.accessStatus === "active", error);
    }

    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-refresh", () => refreshCommittedUserSessions(target.id), failed);

    const outcome = conclude(target.id, true, failed);
    return logged(ctx, outcome, unbanned(target));
  },
});
