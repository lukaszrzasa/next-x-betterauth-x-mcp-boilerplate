import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { userTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import { requestPasswordResetEmail } from "@/app/(AuthModule)/admin/_/services/emails";
import { consumeAdminEmailAttempt } from "@/app/(AuthModule)/admin/_/services/emailThrottle";
import type { UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { authorizeTargetAction } from "./authorizeTarget";

/**
 * The password-reset email of the existing public flow, sent to the
 * target's current address. No step-up: that flow already exists, and this
 * only targets it. Throttled on the server. No staff log entry: no
 * password, factor or session changes, and the message is in the email log.
 */
export const sendPasswordResetOperation = defineAction({
  name: "users.sendPasswordReset",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.send-password-reset"],
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    const { target } = await authorizeTargetAction(ctx, input.userId, "sendPasswordReset");

    // Charged before sending, and kept when sending fails.
    await consumeAdminEmailAttempt(ctx, "password-reset", target.id);
    await requestPasswordResetEmail(ctx, target.email);
    // Accepted by the provider, not delivered.
    return { status: "completed", userId: target.id };
  },
});
