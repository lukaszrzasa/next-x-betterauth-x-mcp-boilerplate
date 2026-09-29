import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { acquireCooldown } from "@/src/lib/throttle";
import { rateLimitedError } from "@/app/(AuthModule)/_/errors/settings";
import { EMAIL_CHANGE_POLICY } from "@/app/(AuthModule)/_/policies/limits";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/services/throttleKeys";
import { requireEmailOwner } from "./ownedRequest";

/**
 * The provider's normal verification email for the actor's own unverified
 * address, on a cooldown; no proof. Not part of the change lifecycle: it
 * proves the address the account already has.
 */
export const resendVerificationOperation = defineAction({
  name: "settings.email.resendVerification",
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx): Promise<{ status: "completed" | "unchanged" }> => {
    const owner = await requireEmailOwner(ctx);
    if (owner.emailVerified) return { status: "unchanged" };

    const cooldown = await acquireCooldown(
      settingsThrottleKeys.verificationResendCooldown(ctx.user.id),
      EMAIL_CHANGE_POLICY.verificationResendCooldownSeconds,
    );
    if (!cooldown.allowed) {
      throw rateLimitedError(cooldown.retryAfterSeconds, "Wait a minute before requesting another verification email.");
    }
    // With the actor's headers the provider insists the address is the session's own.
    await auth.api.sendVerificationEmail({ body: { email: owner.email }, headers: ctx.getRequestHeaders() });
    return { status: "completed" };
  },
});
