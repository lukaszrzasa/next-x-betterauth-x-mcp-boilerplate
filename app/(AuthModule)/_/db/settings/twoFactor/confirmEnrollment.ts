import "server-only";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { decryptRecoveryCodes } from "@/src/lib/auth/factorCodec";
import { assertSecurityStateCurrent, incrementSecurityVersion } from "@/src/lib/auth/securityVersion";
import { db } from "@/src/lib/db";
import { errorMessage } from "@/src/lib/errorMessage";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { providerErrorCode } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { discardStepUpState } from "@/app/(AuthModule)/_/db/settings/shared/sessionEffects";
import type { ConfirmSetupSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { RecoveryCodesIssued } from "@/app/(AuthModule)/_/types/settings";
import { invalidCodeError, setupReplacedError } from "./errors";
import { findFactor, isFactorOfSetup, type FactorRow } from "./factors";
import { markSetupCompleted, requireOwnedSetup, reserveCodeAttempt, spendCode } from "./setupRequests";

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
    const committed = await findFactor(db, ctx.user.id);
    if (!committed || committed.id !== factor.id) throw new Error("The enrolled factor row is missing.");
    return await decryptRecoveryCodes(committed.backupCodes);
  } catch (error) {
    ctx.log.error("enrollment completed but its recovery codes could not be read", { error: errorMessage(error) });
    return null;
  }
}

/** A code from the new authenticator activates it and hands out its first recovery codes. */
export async function confirmEnrollment(ctx: AuthedCtx, input: ConfirmSetupSchema): Promise<RecoveryCodesIssued> {
  return withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const now = new Date();
    const request = await requireOwnedSetup(ctx, reads, input.requestId, "enroll", now);
    const factor = await findFactor(reads, ctx.user.id);
    if (!isFactorOfSetup(factor, request)) throw setupReplacedError();
    if (factor.verified === true) {
      // A completion already won; nothing to prove, nothing to delete.
      await markSetupCompleted(request.id, now);
      return codesUnavailable;
    }
    await assertSecurityStateCurrent(reads, ctx.user.id, request.authorizedSecurityVersion);
    await reserveCodeAttempt(request.id);

    // The generation moves on before the provider-owned write.
    await incrementSecurityVersion(db, ctx.user.id);
    await verifyThroughProvider(ctx, input.code);
    await spendCode(request.id, input.code);
    // TODO(audit): Persist settings.factor.enrolled after the provider's
    // confirmed write (request ID, actor user ID, UTC time). Never codes/secrets.

    await markSetupCompleted(request.id, now).catch((error: unknown) =>
      ctx.log.error("enrollment completed but the setup record could not be closed", { error: errorMessage(error) }),
    );
    await discardStepUpState(ctx);

    const recoveryCodes = await readIssuedCodes(ctx, factor);
    if (!recoveryCodes) return codesUnavailable;
    return { status: "completed", recoveryCodes, issuedAt: now.toISOString(), failedEffects: [] };
  });
}
