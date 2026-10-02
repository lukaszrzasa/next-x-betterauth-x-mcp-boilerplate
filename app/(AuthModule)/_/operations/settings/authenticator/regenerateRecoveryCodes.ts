import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { findFactor } from "@/app/(AuthModule)/_/db/authenticator/factors";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { advanceSecurityVersion } from "@/app/(AuthModule)/_/db/security/retirement";
import { lifecycleError } from "@/app/(AuthModule)/_/errors/settings";
import { currentPasswordOnlySchema } from "@/app/(AuthModule)/_/schemas/settings";
import { rethrowProviderPasswordError } from "@/app/(AuthModule)/_/services/credentials/providerErrors";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/services/credentials/verifyCurrentPassword";
import { discardStepUpState } from "@/app/(AuthModule)/_/services/sessions/sessionEffects";
import type { RecoveryCodesIssued } from "@/app/(AuthModule)/_/types/settings";
import { requireFactorAccount } from "./ownedSetup";

/** The provider replaces the whole code set on the factor row in one write. */
async function generateThroughProvider(ctx: AuthedCtx, password: string): Promise<string[]> {
  try {
    const response = await auth.api.generateBackupCodes({ body: { password }, headers: ctx.getRequestHeaders() });
    return response.backupCodes;
  } catch (error) {
    rethrowProviderPasswordError(error);
  }
}

/**
 * A new set of recovery codes; every earlier code stops working. Enrolled
 * and verified, password plus the existing step-up. The codes are returned
 * once, to the flow that asked, and appear in no log.
 */
export const regenerateRecoveryCodesOperation = defineAction({
  name: "settings.recoveryCodes.regenerate",
  schema: currentPasswordOnlySchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: async (ctx, input): Promise<RecoveryCodesIssued> => {
    await verifyCurrentPassword(ctx, input.currentPassword);

    // Security lock: a replacement swaps the code set with the secret, and
    // disabling removes the row. The codes returned here must belong to the
    // factor that is still there when the provider writes them.
    return withAccountSecurityLock(ctx, ctx.user.id, async () => {
      const account = await requireFactorAccount(ctx);
      const factor = await findFactor(ctx);
      if (!account.twoFactorEnabled || factor?.verified !== true) {
        throw lifecycleError("CONFLICT", "INACTIVE", { key: "auth.errors.noRecoveryCodesToReplace" });
      }
      await assertSecurityStateCurrent(ctx.user.id, securityVersionOf(ctx.user));

      // The generation moves on before the provider-owned write.
      await advanceSecurityVersion(ctx);
      const recoveryCodes = await generateThroughProvider(ctx, input.currentPassword);
      await discardStepUpState(ctx);
      return { status: "completed", recoveryCodes, issuedAt: new Date().toISOString(), failedEffects: [] };
    });
  },
});
