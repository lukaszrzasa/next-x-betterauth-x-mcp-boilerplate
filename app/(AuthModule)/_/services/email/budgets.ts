import "server-only";

import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";
import { consumeBudget } from "@/src/lib/throttle";
import { rateLimitedError } from "@/app/(AuthModule)/_/errors/settings";
import { EMAIL_CHANGE_POLICY, type FixedWindow } from "@/app/(AuthModule)/_/policies/limits";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/services/throttleKeys";

/** Charges one change or correction start against the account's hourly allowance. */
export async function consumeEmailInitiation(ctx: AuthedCtx): Promise<void> {
  const { limit, windowSeconds } = EMAIL_CHANGE_POLICY.initiations;
  const budget = await consumeBudget(settingsThrottleKeys.emailInitiations(ctx.user.id), limit, windowSeconds);
  if (!budget.allowed) {
    throw rateLimitedError(budget.retryAfterSeconds, { key: "auth.errors.tooManyEmailRequests" });
  }
}

async function charge(key: string, window: FixedWindow): Promise<void> {
  const budget = await consumeBudget(key, window.limit, window.windowSeconds);
  if (!budget.allowed) throw rateLimitedError(budget.retryAfterSeconds, { key: "auth.errors.tooManyAttempts" });
}

/** Charges a submit to its request, or, for a token that matches nothing, to the client IP. */
export function chargeProofAttempt(ctx: PublicCtx, requestId: string | null): Promise<void> {
  if (requestId) {
    return charge(settingsThrottleKeys.proofAttempts(requestId), EMAIL_CHANGE_POLICY.proofAttemptsPerRequest);
  }
  return charge(settingsThrottleKeys.unknownProofsFromIp(ctx.ip ?? "unknown"), EMAIL_CHANGE_POLICY.unknownProofsPerIp);
}
