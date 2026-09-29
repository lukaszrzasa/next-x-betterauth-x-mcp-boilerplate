import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { retirePendingSetups } from "@/app/(AuthModule)/_/db/security/retirement";
import { incorrectPasswordError } from "@/app/(AuthModule)/_/errors/settings";
import { enrollmentRequiredFor } from "@/app/(AuthModule)/_/policies/authenticator";
import { currentPasswordOnlySchema } from "@/app/(AuthModule)/_/schemas/settings";
import { providerErrorCode } from "@/app/(AuthModule)/_/services/credentials/providerErrors";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/services/credentials/verifyCurrentPassword";
import { discardStepUpState } from "@/app/(AuthModule)/_/services/sessions/sessionEffects";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";
import { requireFactorAccount } from "./ownedSetup";

const enrollmentRequiredError = () =>
  new ActionError("FORBIDDEN", {
    message: "Your account is required to keep an authenticator; it cannot be disabled.",
    data: { reason: "enrollment-required" },
  });

/**
 * The provider removes its row, clears the flag, rotates the current
 * session and drops this device's trust record; nothing broader is claimed.
 * A thrown result whose effect nonetheless took (the flag is off) counts.
 */
async function disableThroughProvider(ctx: AuthedCtx, password: string): Promise<void> {
  try {
    await auth.api.disableTwoFactor({ body: { password }, headers: ctx.getRequestHeaders() });
  } catch (error) {
    if (providerErrorCode(error) === "INVALID_PASSWORD") throw incorrectPasswordError(error);
    if ((await requireFactorAccount(ctx)).twoFactorEnabled) throw error;
  }
}

/**
 * Turns the authenticator off when neither the staff role nor the stored
 * policy requires it. Password plus the existing factor's step-up; an
 * account without a factor has nothing to turn off.
 */
export const disableAuthenticatorOperation = defineAction({
  name: "settings.authenticator.disable",
  schema: currentPasswordOnlySchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: async (ctx, input): Promise<SyncOutcome> => {
    await verifyCurrentPassword(ctx, input.currentPassword);

    // Security lock: the staged setup is retired in one commit and the
    // provider removes the factor in another. A replacement confirmed in
    // between would swap a secret into a factor that is being removed.
    return withAccountSecurityLock(ctx, ctx.user.id, async () => {
      const account = await requireFactorAccount(ctx);
      // Already off comes first: it is a no-op even where policy requires a factor.
      if (!account.twoFactorEnabled) return { status: "unchanged" };
      if (enrollmentRequiredFor(account)) throw enrollmentRequiredError();
      await assertSecurityStateCurrent(ctx.user.id, securityVersionOf(ctx.user));

      // Committed before the provider write, and it stands if that write fails.
      await retirePendingSetups(ctx);
      await disableThroughProvider(ctx, input.currentPassword);
      await discardStepUpState(ctx);
      return { status: "completed" };
    });
  },
});
