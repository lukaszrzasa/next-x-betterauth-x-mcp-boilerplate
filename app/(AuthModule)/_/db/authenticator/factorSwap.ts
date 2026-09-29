import "server-only";

import { and, eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { fingerprintEncryptedSecret } from "@/src/lib/auth/factorCodec";
import { incrementSecurityVersion } from "@/src/lib/auth/securityVersion";
import { authenticatorSetupRequest, db, twoFactor } from "@/src/lib/db";

export type FactorSwap = {
  requestId: string;
  /** The verified factor the replacement was started against: its row and its secret's fingerprint. */
  factorId: string;
  factorFingerprint: string;
  /** The staged secret, already encrypted, and the new recovery-code set. */
  secret: string;
  encryptedCodes: string;
  now: Date;
};

/**
 * Swaps the active secret and the recovery-code set, completes the setup
 * request and moves the security generation on, in one transaction against
 * the locked factor row: there is never a moment without a working factor
 * or with two verified rows.
 *
 * `false`, with nothing written, when the factor is no longer the verified
 * row the attempt was bound to, or when the request is no longer the
 * actor's pending one (cancelled, expired or superseded meanwhile).
 */
export async function swapFactor(ctx: AuthedCtx, swap: FactorSwap): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [factor] = await tx.select().from(twoFactor).where(eq(twoFactor.id, swap.factorId)).for("update");
    const bound =
      factor?.userId === ctx.user.id &&
      factor.verified === true &&
      fingerprintEncryptedSecret(factor.secret) === swap.factorFingerprint;
    if (!bound) return false;

    const completed = await tx
      .update(authenticatorSetupRequest)
      .set({ state: "completed", completedAt: swap.now, replacementSecret: null })
      .where(
        and(
          eq(authenticatorSetupRequest.id, swap.requestId),
          eq(authenticatorSetupRequest.userId, ctx.user.id),
          eq(authenticatorSetupRequest.state, "pending"),
        ),
      )
      .returning({ id: authenticatorSetupRequest.id });
    // Nothing has been written when the request already left `pending`.
    if (completed.length === 0) return false;

    await tx
      .update(twoFactor)
      .set({
        secret: swap.secret,
        backupCodes: swap.encryptedCodes,
        verified: true,
        failedVerificationCount: 0,
        lockedUntil: null,
      })
      .where(eq(twoFactor.id, factor.id));
    await incrementSecurityVersion(ctx.user.id, tx);
    return true;
  });
}
