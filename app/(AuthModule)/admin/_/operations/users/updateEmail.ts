import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { revokeCurrentUserSessions } from "@/src/lib/auth/userSessionEffects";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { retirePendingSecurityState } from "@/app/(AuthModule)/_/db/security/retirement";
import { updateUserEmailSchema } from "@/app/(AuthModule)/admin/_/schema";
import { attemptEffect, conclude, unchanged } from "@/app/(AuthModule)/admin/_/services/effects";
import { emailUpdated, logged } from "@/app/(AuthModule)/admin/_/services/staffLog";
import type { FailedEffect, UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { authorizeTargetAction } from "./authorizeTarget";
import { confirmCommitted } from "./confirmCommitted";
import { sendVerificationToCurrentEmail } from "./emailEffects";

/**
 * An administrative change of the sign-in address. One provider write
 * carries the address, the verification reset and the cutoff that retires
 * older reset links; every session is then revoked and the *new* address is
 * asked to verify itself. Five-minute step-up.
 */
export const updateUserEmailOperation = defineAction({
  name: "users.updateEmail",
  schema: updateUserEmailSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.update", "user.set-email"],
  mcpAllowed: false,
  stepUp: "five_minutes",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    const failed: FailedEffect[] = [];

    // Security lock: retirement and the provider's address write commit
    // separately. The owner's own email request or password change must not
    // run between them and outlive the address it was authorized for.
    const change = await withAccountSecurityLock(ctx, input.userId, async () => {
      const { target } = await authorizeTargetAction(ctx, input.userId, "updateEmail");
      if (target.email === input.email) return null;

      // Committed before the provider write; a failure here blocks the change
      // rather than leaving an old request able to complete afterwards.
      await retirePendingSecurityState(ctx, target.id, "admin_change");
      try {
        await auth.api.adminUpdateUser({
          body: {
            userId: target.id,
            data: { email: input.email, emailVerified: false, passwordResetInvalidBefore: new Date() },
          },
          headers: ctx.getRequestHeaders(),
        });
      } catch (error) {
        await confirmCommitted(ctx, target.id, (current) => current.email === input.email, error);
      }

      await attemptEffect(ctx, "session-revocation", () => revokeCurrentUserSessions(target.id), failed);
      return { before: target, after: { ...target, email: input.email, emailVerified: false } };
    });
    if (!change) return unchanged(input.userId);

    // Outside the lock: sending mail must never hold up other account actions.
    await sendVerificationToCurrentEmail(ctx, change.after, failed);

    const outcome = conclude(change.after.id, true, failed);
    return logged(ctx, outcome, emailUpdated(change.after, change.before.email, input.email));
  },
});
