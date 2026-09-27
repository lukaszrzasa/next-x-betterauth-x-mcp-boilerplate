import "server-only";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { clearAttempts, refundAttempt, reserveAttempt } from "@/src/lib/throttle";
import { CURRENT_PASSWORD_FAILURES } from "@/app/(AuthModule)/_/db/settings/shared/policy";
import { incorrectPasswordError, providerErrorCode, rateLimitedError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/db/settings/shared/throttleKeys";

/**
 * The check every sensitive settings operation starts with: the actor's own
 * current password, through the provider's verifier. One attempt is
 * reserved atomically before the comparison: a confirmed wrong password
 * keeps the charge, a correct one clears the streak, and an infrastructure
 * error hands its reservation back.
 */
export async function verifyCurrentPassword(ctx: AuthedCtx, password: string): Promise<void> {
  const key = settingsThrottleKeys.currentPasswordFailures(ctx.user.id);
  const { limit, windowSeconds } = CURRENT_PASSWORD_FAILURES;
  const reservation = await reserveAttempt(key, limit, windowSeconds);
  if (!reservation.allowed) {
    throw rateLimitedError(reservation.retryAfterSeconds, "Too many incorrect passwords. Try again later.");
  }
  try {
    await auth.api.verifyPassword({ body: { password }, headers: ctx.getRequestHeaders() });
  } catch (error) {
    if (providerErrorCode(error) === "INVALID_PASSWORD") throw incorrectPasswordError(error);
    await refundAttempt(key);
    throw error;
  }
  await clearAttempts(key);
}
