import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { consumeBudget } from "@/src/lib/throttle";
import { EMAIL_CHANGE_POLICY } from "@/app/(AuthModule)/_/db/settings/shared/policy";
import { rateLimitedError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/db/settings/shared/throttleKeys";

/** Charges one change or correction start against the account's hourly allowance. */
export async function consumeEmailInitiation(ctx: AuthedCtx): Promise<void> {
  const { limit, windowSeconds } = EMAIL_CHANGE_POLICY.initiations;
  const budget = await consumeBudget(settingsThrottleKeys.emailInitiations(ctx.user.id), limit, windowSeconds);
  if (!budget.allowed) {
    throw rateLimitedError(budget.retryAfterSeconds, "Too many email change requests. Try again later.");
  }
}
