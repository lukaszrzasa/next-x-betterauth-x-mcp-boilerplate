import "server-only";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db } from "@/src/lib/db";
import { acquireCooldown } from "@/src/lib/throttle";
import { EMAIL_CHANGE_POLICY } from "@/app/(AuthModule)/_/db/settings/shared/policy";
import { rateLimitedError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/db/settings/shared/throttleKeys";
import { loadOwner } from "./owner";

/**
 * The provider's normal verification email for the actor's own unverified
 * address, on a cooldown. Not part of the change lifecycle: it proves the
 * address the account already has.
 */
export async function resendOwnVerification(ctx: AuthedCtx): Promise<{ status: "completed" | "unchanged" }> {
  const owner = await loadOwner(db, ctx.user.id);
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
}
