import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { listActiveUserSessions } from "@/src/lib/auth/userSessionEffects";
import { errorMessage } from "@/src/lib/errorMessage";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { retirePendingSecurityState } from "@/app/(AuthModule)/_/db/security/retirement";
import { incorrectPasswordError } from "@/app/(AuthModule)/_/errors/settings";
import { changePasswordSchema, type ChangePasswordSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { providerErrorCode } from "@/app/(AuthModule)/_/services/credentials/providerErrors";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/services/credentials/verifyCurrentPassword";
import { discardStepUpState } from "@/app/(AuthModule)/_/services/sessions/sessionEffects";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";

/**
 * After a thrown provider result, decide from the persisted credential
 * whether the new password took: the provider's own verifier against the
 * current hash, nothing else leaves this helper.
 */
async function newPasswordCommitted(userId: string, newPassword: string): Promise<boolean> {
  const context = await auth.$context;
  const account = await context.internalAdapter.findCredentialAccount(userId);
  if (!account?.password) return false;
  return context.password.verify({ hash: account.password, password: newPassword });
}

/** Observe rather than trust: after "sign out other devices" exactly the renewed session remains. */
async function otherSessionsRemain(ctx: AuthedCtx): Promise<boolean> {
  try {
    return (await listActiveUserSessions(ctx.user.id)).length > 1;
  } catch (error) {
    ctx.log.error("session revocation after password change could not be verified", { error: errorMessage(error) });
    return true;
  }
}

/**
 * The provider owns the credential write: hashing, and what happens to the
 * sessions. `renewed: false` means the provider threw after writing the
 * hash: the password changed, but its session renewal is unconfirmed.
 */
async function changeThroughProvider(ctx: AuthedCtx, input: ChangePasswordSchema): Promise<{ renewed: boolean }> {
  try {
    // The checkbox maps directly to the provider's own semantics: true
    // removes every session and renews the current one (its cookie is
    // forwarded by nextCookies); false leaves every session as it is.
    await auth.api.changePassword({
      headers: ctx.getRequestHeaders(),
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: input.revokeOtherSessions,
      },
    });
    return { renewed: true };
  } catch (error) {
    if (providerErrorCode(error) === "INVALID_PASSWORD") throw incorrectPasswordError(error);
    if (!(await newPasswordCommitted(ctx.user.id, input.newPassword))) throw error;
    ctx.log.error("password changed but the provider's session renewal was not confirmed", {
      error: errorMessage(error),
    });
    return { renewed: false };
  }
}

/**
 * Verified email and, for an enrolled account, the five-minute step-up; a
 * user without an authenticator is protected by the current-password check.
 * A wrong password is charged to its budget and retires nothing.
 */
export const changePasswordOperation = defineAction({
  name: "settings.password.change",
  schema: changePasswordSchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: async (ctx, input): Promise<SyncOutcome> => {
    await verifyCurrentPassword(ctx, input.currentPassword);

    // Security lock: retirement and the credential write commit separately.
    // Without it an email request or factor setup started in between would
    // outlive the password it was authorized under.
    return withAccountSecurityLock(ctx, ctx.user.id, async () => {
      await assertSecurityStateCurrent(ctx.user.id, securityVersionOf(ctx.user));
      // Committed before the provider write, and it stands if that write fails.
      await retirePendingSecurityState(ctx, ctx.user.id, "credentials");

      const { renewed } = await changeThroughProvider(ctx, input);
      if (!renewed) return { status: "partial", committed: true, failedEffects: ["session-renewal"] };

      const revocationUnconfirmed = input.revokeOtherSessions && (await otherSessionsRemain(ctx));
      await discardStepUpState(ctx);
      if (revocationUnconfirmed) return { status: "partial", committed: true, failedEffects: ["session-revocation"] };
      return { status: "completed" };
    });
  },
});
