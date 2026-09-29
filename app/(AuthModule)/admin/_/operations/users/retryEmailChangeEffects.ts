import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { revokeCurrentUserSessions } from "@/src/lib/auth/userSessionEffects";
import { userTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import { attemptEffect, conclude } from "@/app/(AuthModule)/admin/_/services/effects";
import { logged, sessionsRetried } from "@/app/(AuthModule)/admin/_/services/staffLog";
import type { FailedEffect, UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { authorizeTargetAction } from "./authorizeTarget";
import { sendVerificationToCurrentEmail } from "./emailEffects";

/**
 * Recovery after a partial email change, with the permissions and step-up
 * of the change it finishes: revoke whatever sessions exist now and request
 * verification for the *current* address if it is still unverified. No
 * address or cutoff is written; nothing from the failed request is replayed.
 */
export const retryEmailChangeEffectsOperation = defineAction({
  name: "users.retryEmailChangeEffects",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.update", "user.set-email"],
  mcpAllowed: false,
  stepUp: "five_minutes",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    const { target } = await authorizeTargetAction(ctx, input.userId, "updateEmail");

    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-revocation", () => revokeCurrentUserSessions(target.id), failed);
    if (!target.emailVerified) await sendVerificationToCurrentEmail(ctx, target, failed);

    const outcome = conclude(target.id, false, failed);
    return logged(ctx, outcome, failed.length === 0 ? sessionsRetried(target, "session sign-out") : undefined);
  },
});
