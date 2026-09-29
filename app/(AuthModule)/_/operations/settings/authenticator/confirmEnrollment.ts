import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { decryptRecoveryCodes } from "@/src/lib/auth/factorCodec";
import { assertSecurityStateCurrent } from "@/src/lib/auth/securityVersion";
import { errorMessage } from "@/src/lib/errorMessage";
import { findFactor, type FactorRow } from "@/app/(AuthModule)/_/db/authenticator/factors";
import { markSetupCompleted } from "@/app/(AuthModule)/_/db/authenticator/setupRequests";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { advanceSecurityVersion } from "@/app/(AuthModule)/_/db/security/retirement";
import { invalidCodeError, setupReplacedError } from "@/app/(AuthModule)/_/errors/authenticatorSetup";
import { isFactorOfSetup } from "@/app/(AuthModule)/_/policies/authenticator";
import { confirmSetupSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { reserveCodeAttempt, spendCode } from "@/app/(AuthModule)/_/services/authenticator/setupBudgets";
import { providerErrorCode } from "@/app/(AuthModule)/_/services/credentials/providerErrors";
import { discardStepUpState } from "@/app/(AuthModule)/_/services/sessions/sessionEffects";
import type { RecoveryCodesIssued } from "@/app/(AuthModule)/_/types/settings";
import { requireOwnedSetup } from "./ownedSetup";

const codesUnavailable: RecoveryCodesIssued = {
  status: "completed-codes-unavailable",
  action: "regenerate-recovery-codes",
};

/** The provider's verification, which for a pending row also marks the account enrolled and rotates the session. */
async function verifyThroughProvider(ctx: AuthedCtx, code: string): Promise<void> {
  try {
    await auth.api.verifyTOTP({ body: { code }, headers: ctx.getRequestHeaders() });
  } catch (error) {
    if (providerErrorCode(error) === "INVALID_CODE") throw invalidCodeError();
    throw error;
  }
}

/** The codes the provider generated for this exact row, read once, here, and never again. */
async function readIssuedCodes(ctx: AuthedCtx, factor: FactorRow): Promise<string[] | null> {
  try {
    const committed = await findFactor(ctx);
    if (!committed || committed.id !== factor.id) throw new Error("The enrolled factor row is missing.");
    return await decryptRecoveryCodes(committed.backupCodes);
  } catch (error) {
    ctx.log.error("enrollment completed but its recovery codes could not be read", { error: errorMessage(error) });
    return null;
  }
}

/** A code from the new authenticator activates it and hands out its first recovery codes. */
export const confirmEnrollmentOperation = defineAction({
  name: "settings.authenticator.confirmEnrollment",
  schema: confirmSetupSchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<RecoveryCodesIssued> => {
    // Security lock: the provider verifies and activates the factor on its
    // own connection. A cancellation deleting that row, or a second
    // confirmation, must not run between the checks here and that write.
    return withAccountSecurityLock(ctx, ctx.user.id, async () => {
      const now = new Date();
      const setup = await requireOwnedSetup(ctx, input.requestId, "enroll", now);
      const factor = await findFactor(ctx);
      if (!isFactorOfSetup(factor, setup)) throw setupReplacedError();
      if (factor.verified === true) {
        // A completion already won; nothing to prove, nothing to delete.
        await markSetupCompleted(ctx, setup.id, now);
        return codesUnavailable;
      }
      await assertSecurityStateCurrent(ctx.user.id, setup.authorizedSecurityVersion);
      // Charged before the code is checked.
      await reserveCodeAttempt(setup.id);

      // The generation moves on before the provider-owned write.
      await advanceSecurityVersion(ctx);
      await verifyThroughProvider(ctx, input.code);
      await spendCode(setup.id, input.code);

      await markSetupCompleted(ctx, setup.id, now).catch((error: unknown) =>
        ctx.log.error("enrollment completed but the setup record could not be closed", { error: errorMessage(error) }),
      );
      await discardStepUpState(ctx);

      const recoveryCodes = await readIssuedCodes(ctx, factor);
      if (!recoveryCodes) return codesUnavailable;
      return { status: "completed", recoveryCodes, issuedAt: now.toISOString(), failedEffects: [] };
    });
  },
});
