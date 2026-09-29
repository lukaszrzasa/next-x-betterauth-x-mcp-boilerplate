import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import {
  decryptFactorSecret,
  encryptRecoveryCodes,
  generateRecoveryCodes,
  verifyFactorCode,
} from "@/src/lib/auth/factorCodec";
import { assertSecurityStateCurrent } from "@/src/lib/auth/securityVersion";
import { swapFactor } from "@/app/(AuthModule)/_/db/authenticator/factorSwap";
import { findFactor } from "@/app/(AuthModule)/_/db/authenticator/factors";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { invalidCodeError, setupReplacedError } from "@/app/(AuthModule)/_/errors/authenticatorSetup";
import { isFactorOfSetup } from "@/app/(AuthModule)/_/policies/authenticator";
import { confirmSetupSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { reserveCodeAttempt, spendCode } from "@/app/(AuthModule)/_/services/authenticator/setupBudgets";
import { discardStepUpState, refreshUserSessions } from "@/app/(AuthModule)/_/services/sessions/sessionEffects";
import type { RecoveryCodesIssued } from "@/app/(AuthModule)/_/types/settings";
import { requireOwnedSetup } from "./ownedSetup";

/**
 * The safe replacement, step two: a code from the *new* authenticator
 * commits the swap (the existing factor's step-up is re-required when its
 * grant has lapsed). Expiry or cancellation leaves the old setup as it was.
 */
export const confirmReplacementOperation = defineAction({
  name: "settings.authenticator.confirmReplacement",
  schema: confirmSetupSchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: async (ctx, input): Promise<RecoveryCodesIssued> => {
    // Security lock: disabling and recovery-code regeneration change the
    // same factor through the provider. The swap's own transaction also
    // re-checks the factor and the pending request, so a cancelled or
    // superseded attempt cannot commit even without it.
    return withAccountSecurityLock(ctx, ctx.user.id, async () => {
      const now = new Date();
      const setup = await requireOwnedSetup(ctx, input.requestId, "replace", now);
      const stagedSecret = setup.replacementSecret;
      if (!stagedSecret) throw setupReplacedError();

      const factor = await findFactor(ctx);
      if (!isFactorOfSetup(factor, setup) || factor.verified !== true) throw setupReplacedError();
      await assertSecurityStateCurrent(ctx.user.id, setup.authorizedSecurityVersion);

      // Charged before the code is checked.
      await reserveCodeAttempt(setup.id);
      if (!(await verifyFactorCode(await decryptFactorSecret(stagedSecret), input.code))) throw invalidCodeError();
      await spendCode(setup.id, input.code);

      const recoveryCodes = generateRecoveryCodes();
      const swapped = await swapFactor(ctx, {
        requestId: setup.id,
        factorId: factor.id,
        factorFingerprint: setup.currentFactorFingerprint,
        secret: stagedSecret,
        encryptedCodes: await encryptRecoveryCodes(recoveryCodes),
        now,
      });
      if (!swapped) throw setupReplacedError();

      const refreshed = await refreshUserSessions(ctx, "factor replaced but cached user copies were not refreshed");
      await discardStepUpState(ctx);
      return {
        status: refreshed ? "completed" : "partial",
        recoveryCodes,
        issuedAt: now.toISOString(),
        failedEffects: refreshed ? [] : ["session-refresh"],
      };
    });
  },
});
