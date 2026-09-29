import "server-only";

import { eq } from "drizzle-orm";

import { auth } from "@/src/lib/auth";
import type { PublicCtx } from "@/src/lib/auth/builders/context";
import { isResetTokenSuperseded, resetTokenIdentifier } from "@/src/lib/auth/resetTokenPolicy";
import { user } from "@/src/lib/db";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { fieldError, lifecycleError, providerErrorCode } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { retirePendingSecurityState } from "@/app/(AuthModule)/_/db/settings/shared/retirePendingSecurityState";
import type { CompletePasswordResetSchema } from "@/app/(AuthModule)/_/schemas/settings";

const invalidResetLink = () => lifecycleError("FORBIDDEN", "INACTIVE", "This reset link is invalid or expired.");

type ResetProof = { userId: string; createdAt: unknown };

async function resolveResetToken(token: string): Promise<ResetProof | null> {
  const context = await auth.$context;
  const verification = await context.internalAdapter.findVerificationValue(resetTokenIdentifier(token));
  if (!verification || verification.expiresAt.getTime() <= Date.now()) return null;
  return { userId: verification.value, createdAt: verification.createdAt };
}

/** The provider's own reset, with its refusals turned into the page's field and link errors. */
async function resetThroughProvider(input: CompletePasswordResetSchema): Promise<void> {
  try {
    await auth.api.resetPassword({ body: { newPassword: input.newPassword, token: input.token } });
  } catch (error) {
    const code = providerErrorCode(error);
    if (code === "INVALID_TOKEN" || code === "USER_NOT_FOUND") throw invalidResetLink();
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
      throw fieldError("INVALID_INPUT", "newPassword", code, "Use between 8 and 128 characters.", error);
    }
    throw error;
  }
}

/**
 * The existing lost-password recovery, completed through the account lock:
 * resolve the provider's token, refuse links issued at or before the
 * account's reset cutoff, retire pending email/factor requests, then let the
 * provider consume the token, hash the password and revoke sessions exactly
 * as before. No current password or second factor is added to recovery.
 */
export async function completePasswordReset(
  ctx: PublicCtx,
  input: CompletePasswordResetSchema,
): Promise<{ status: "completed" }> {
  const resolved = await resolveResetToken(input.token);
  if (!resolved) throw invalidResetLink();

  return withUserAccountLock(ctx, resolved.userId, async (reads) => {
    // Re-read under the lock: the token may have been consumed meanwhile.
    const proof = await resolveResetToken(input.token);
    if (!proof || proof.userId !== resolved.userId) throw invalidResetLink();
    const [account] = await reads
      .select({ id: user.id, cutoff: user.passwordResetInvalidBefore })
      .from(user)
      .where(eq(user.id, proof.userId))
      .limit(1);
    if (!account || isResetTokenSuperseded({ createdAt: proof.createdAt }, account.cutoff)) {
      throw invalidResetLink();
    }

    await retirePendingSecurityState(ctx, proof.userId, "credentials");
    await resetThroughProvider(input);
    return { status: "completed" };
  });
}
