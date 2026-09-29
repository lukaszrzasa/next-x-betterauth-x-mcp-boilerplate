import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { refreshCommittedUserSessions } from "@/src/lib/auth/userSessionEffects";
import { updateUserNameSchema } from "@/app/(AuthModule)/admin/_/schema";
import { attemptEffect, conclude, unchanged } from "@/app/(AuthModule)/admin/_/services/effects";
import { logged, nameUpdated } from "@/app/(AuthModule)/admin/_/services/staffLog";
import type { FailedEffect, UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { authorizeTargetAction } from "./authorizeTarget";
import { confirmCommitted } from "./confirmCommitted";

/**
 * The display name, as a single whitelisted provider write followed by an
 * observed session refresh. An ordinary edit: the last committed write
 * wins, and nothing is serialized around it.
 */
export const updateUserNameOperation = defineAction({
  name: "users.updateName",
  schema: updateUserNameSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.update"],
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    const { target } = await authorizeTargetAction(ctx, input.userId, "updateName");
    if (target.name === input.name) return unchanged(target.id);

    try {
      // A whitelist of exactly one field: nothing else on the row is touched.
      await auth.api.adminUpdateUser({
        body: { userId: target.id, data: { name: input.name } },
        headers: ctx.getRequestHeaders(),
      });
    } catch (error) {
      await confirmCommitted(ctx, target.id, (current) => current.name === input.name, error);
    }

    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-refresh", () => refreshCommittedUserSessions(target.id), failed);

    const outcome = conclude(target.id, true, failed);
    return logged(ctx, outcome, nameUpdated({ id: target.id, name: input.name }, target.name));
  },
});
