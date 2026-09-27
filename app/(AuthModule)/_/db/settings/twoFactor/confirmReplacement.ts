import "server-only";

import { eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import {
  decryptFactorSecret,
  encryptRecoveryCodes,
  generateRecoveryCodes,
  verifyFactorCode,
} from "@/src/lib/auth/factorCodec";
import { assertSecurityStateCurrent, incrementSecurityVersion } from "@/src/lib/auth/securityVersion";
import { authenticatorSetupRequest, db, twoFactor } from "@/src/lib/db";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { discardStepUpState, refreshUserSessions } from "@/app/(AuthModule)/_/db/settings/shared/sessionEffects";
import type { ConfirmSetupSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { RecoveryCodesIssued } from "@/app/(AuthModule)/_/types/settings";
import { invalidCodeError, setupReplacedError } from "./errors";
import { findFactor, isFactorOfSetup } from "./factors";
import { requireOwnedSetup, reserveCodeAttempt, spendCode, type SetupRequestRow } from "./setupRequests";

type Swap = { factorId: string; secret: string; encryptedCodes: string; now: Date };

/**
 * Swaps the active secret and the recovery-code set in one transaction,
 * against the locked factor row: there is never a moment without a working
 * factor or with two verified rows. `false` when the factor moved on meanwhile.
 */
async function swapFactor(ctx: AuthedCtx, request: SetupRequestRow, swap: Swap): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(twoFactor).where(eq(twoFactor.id, swap.factorId)).for("update");
    if (!isFactorOfSetup(locked ?? null, request) || locked.verified !== true) return false;
    await tx
      .update(twoFactor)
      .set({
        secret: swap.secret,
        backupCodes: swap.encryptedCodes,
        verified: true,
        failedVerificationCount: 0,
        lockedUntil: null,
      })
      .where(eq(twoFactor.id, locked.id));
    await tx
      .update(authenticatorSetupRequest)
      .set({ state: "completed", completedAt: swap.now, replacementSecret: null })
      .where(eq(authenticatorSetupRequest.id, request.id));
    await incrementSecurityVersion(tx, ctx.user.id);
    return true;
  });
}

/**
 * The safe replacement, step two: a code from the *new* authenticator (the
 * existing factor's step-up was satisfied by the operation) commits the
 * swap. Expiry or cancellation leaves the old setup as it was.
 */
export async function confirmReplacement(ctx: AuthedCtx, input: ConfirmSetupSchema): Promise<RecoveryCodesIssued> {
  return withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const now = new Date();
    const request = await requireOwnedSetup(ctx, reads, input.requestId, "replace", now);
    const stagedSecret = request.replacementSecret;
    if (!stagedSecret) throw setupReplacedError();
    const factor = await findFactor(reads, ctx.user.id);
    if (!isFactorOfSetup(factor, request) || factor.verified !== true) throw setupReplacedError();
    await assertSecurityStateCurrent(reads, ctx.user.id, request.authorizedSecurityVersion);
    await reserveCodeAttempt(request.id);

    if (!(await verifyFactorCode(await decryptFactorSecret(stagedSecret), input.code))) throw invalidCodeError();
    await spendCode(request.id, input.code);

    const recoveryCodes = generateRecoveryCodes();
    const swapped = await swapFactor(ctx, request, {
      factorId: factor.id,
      secret: stagedSecret,
      encryptedCodes: await encryptRecoveryCodes(recoveryCodes),
      now,
    });
    if (!swapped) throw setupReplacedError();
    // TODO(audit): Persist settings.factor.replaced after this commit (request
    // ID, actor user ID, UTC time; recovery codes replaced). Never secrets/codes.

    const refreshed = await refreshUserSessions(ctx, "factor replaced but cached user copies were not refreshed");
    await discardStepUpState(ctx);
    return {
      status: refreshed ? "completed" : "partial",
      recoveryCodes,
      issuedAt: now.toISOString(),
      failedEffects: refreshed ? [] : ["session-refresh"],
    };
  });
}
