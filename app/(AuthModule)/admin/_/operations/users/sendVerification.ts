import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { userTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import { unchanged } from "@/app/(AuthModule)/admin/_/services/effects";
import { requestVerificationEmail } from "@/app/(AuthModule)/admin/_/services/emails";
import { consumeAdminEmailAttempt } from "@/app/(AuthModule)/admin/_/services/emailThrottle";
import type { UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { authorizeTargetAction } from "./authorizeTarget";

/**
 * The verification email for an unverified account; an address that is
 * already verified has nothing to be sent. No step-up: the message proves
 * nothing by itself. Throttled on the server. No staff log entry: nothing
 * on the account changes, and the message is in the email log.
 */
export const sendVerificationOperation = defineAction({
  name: "users.sendVerification",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.send-verification"],
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    const { target, unchanged: alreadyVerified } = await authorizeTargetAction(ctx, input.userId, "sendVerification");
    if (alreadyVerified) return unchanged(target.id);

    // Charged before sending, and kept when sending fails.
    await consumeAdminEmailAttempt(ctx, "verification", target.id);
    await requestVerificationEmail(ctx, target.email);
    // Accepted by the provider, not delivered; the message itself is in the email log.
    return { status: "completed", userId: target.id };
  },
});
