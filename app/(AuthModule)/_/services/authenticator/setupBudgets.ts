import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { claimOnce, consumeBudget, reserveAttempt } from "@/src/lib/throttle";
import { invalidCodeError } from "@/app/(AuthModule)/_/errors/authenticatorSetup";
import { rateLimitedError } from "@/app/(AuthModule)/_/errors/settings";
import { AUTHENTICATOR_SETUP_POLICY } from "@/app/(AuthModule)/_/policies/limits";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/services/throttleKeys";

/** Charges one setup start against the account's hourly allowance. */
export async function consumeSetupInitiation(ctx: AuthedCtx): Promise<void> {
  const { limit, windowSeconds } = AUTHENTICATOR_SETUP_POLICY.initiations;
  const budget = await consumeBudget(settingsThrottleKeys.setupInitiations(ctx.user.id), limit, windowSeconds);
  if (!budget.allowed) {
    throw rateLimitedError(budget.retryAfterSeconds, { key: "auth.errors.tooManySetups" });
  }
}

/** Charges one code attempt against the attempt's own budget, before the code is checked. */
export async function reserveCodeAttempt(requestId: string): Promise<void> {
  const { limit, windowSeconds } = AUTHENTICATOR_SETUP_POLICY.codeAttempts;
  const decision = await reserveAttempt(settingsThrottleKeys.setupCodeAttempts(requestId), limit, windowSeconds);
  if (!decision.allowed) {
    throw rateLimitedError(decision.retryAfterSeconds, { key: "auth.errors.tooManyIncorrectCodes" });
  }
}

/** A correct code completes an attempt once; the same code submitted again is refused as invalid. */
export async function spendCode(requestId: string, code: string): Promise<void> {
  const key = settingsThrottleKeys.spentSetupCode(requestId, code);
  if (!(await claimOnce(key, AUTHENTICATOR_SETUP_POLICY.spentCodeSeconds))) throw invalidCodeError();
}
