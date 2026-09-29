import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { isResetTokenSuperseded, resetTokenIdentifier } from "@/src/lib/auth/resetTokenPolicy";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { findResetCutoff } from "@/app/(AuthModule)/_/db/security/resetCutoff";
import { retirePendingSecurityState } from "@/app/(AuthModule)/_/db/security/retirement";
import { fieldError, lifecycleError } from "@/app/(AuthModule)/_/errors/settings";
import { completePasswordResetSchema, type CompletePasswordResetSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { providerErrorCode } from "@/app/(AuthModule)/_/services/credentials/providerErrors";

const invalidResetLink = () => lifecycleError("FORBIDDEN", "INACTIVE", "This reset link is invalid or expired.");

type ResetProof = { userId: string; createdAt: unknown };

/** The account an unexpired reset token stands for. Inspects only: the provider consumes the token. */
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
 * Completion of the public lost-password flow. The provider's token is the
 * whole authority: no session, current password or second factor is
 * required, and whoever is signed in on the browser is irrelevant.
 */
export const completePasswordResetOperation = defineAction({
  name: "auth.passwordReset.complete",
  auth: "public",
  schema: completePasswordResetSchema,
  mcpAllowed: false,
  handler: async (ctx, input): Promise<{ status: "completed" }> => {
    // Located first only to learn whose account to coordinate on.
    const located = await resolveResetToken(input.token);
    if (!located) throw invalidResetLink();

    // Security lock: as for a password change, retirement and the provider's
    // credential write commit separately.
    return withAccountSecurityLock(ctx, located.userId, async () => {
      // Read again under the lock: the token may have been consumed meanwhile.
      const proof = await resolveResetToken(input.token);
      if (!proof || proof.userId !== located.userId) throw invalidResetLink();

      // Links issued at or before the account's cutoff no longer count.
      const account = await findResetCutoff(ctx, proof.userId);
      if (!account || isResetTokenSuperseded({ createdAt: proof.createdAt }, account.cutoff)) {
        throw invalidResetLink();
      }

      await retirePendingSecurityState(ctx, proof.userId, "credentials");
      // The provider consumes the token, hashes the password and revokes sessions.
      await resetThroughProvider(input);
      return { status: "completed" };
    });
  },
});
