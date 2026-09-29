import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { attemptEffect } from "@/app/(AuthModule)/admin/_/services/effects";
import { requestVerificationEmail } from "@/app/(AuthModule)/admin/_/services/emails";
import { consumeAdminEmailAttempt } from "@/app/(AuthModule)/admin/_/services/emailThrottle";
import type { FailedEffect } from "@/app/(AuthModule)/admin/_/types";
import type { Target } from "./authorizeTarget";

/**
 * The verification email an address change ends with, as an observed
 * effect: throttled like the manual action, and a refusal or failure is
 * recorded in `failed` rather than thrown.
 */
export async function sendVerificationToCurrentEmail(
  ctx: AuthedCtx,
  target: Pick<Target, "id" | "email">,
  failed: FailedEffect[],
): Promise<void> {
  await attemptEffect(
    ctx,
    "verification-email",
    async () => {
      await consumeAdminEmailAttempt(ctx, "verification", target.id);
      await requestVerificationEmail(ctx, target.email);
    },
    failed,
  );
}
