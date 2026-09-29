import "server-only";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { listActiveUserSessions } from "@/src/lib/auth/userSessionEffects";
import { errorMessage } from "@/src/lib/errorMessage";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { incorrectPasswordError, providerErrorCode } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { retirePendingSecurityState } from "@/app/(AuthModule)/_/db/settings/shared/retirePendingSecurityState";
import { discardStepUpState } from "@/app/(AuthModule)/_/db/settings/shared/sessionEffects";
import type { ChangePasswordSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { SettingsEffect, SyncOutcome } from "@/app/(AuthModule)/_/types/settings";
import { verifyCurrentPassword } from "./verifyCurrentPassword";

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
 * The provider owns the credential write (hashing, session behaviour); this
 * service adds the failure budget, retires pending email and factor-setup
 * requests with a security-version increment first, and reports a write
 * whose session renewal could not be confirmed as partial.
 */
export async function changeOwnPassword(ctx: AuthedCtx, input: ChangePasswordSchema): Promise<SyncOutcome> {
  await verifyCurrentPassword(ctx, input.currentPassword);

  return withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    await assertSecurityStateCurrent(reads, ctx.user.id, securityVersionOf(ctx.user));
    await retirePendingSecurityState(ctx, ctx.user.id, "credentials");

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
    } catch (error) {
      if (providerErrorCode(error) === "INVALID_PASSWORD") throw incorrectPasswordError(error);
      // The provider may fail after writing the hash (a renewal problem).
      if (!(await newPasswordCommitted(ctx.user.id, input.newPassword))) throw error;
      ctx.log.error("password changed but the provider's session renewal was not confirmed", {
        error: errorMessage(error),
      });
      return { status: "partial", committed: true, failedEffects: ["session-renewal"] };
    }

    const failed: SettingsEffect[] = [];
    if (input.revokeOtherSessions && (await otherSessionsRemain(ctx))) failed.push("session-revocation");
    await discardStepUpState(ctx);
    if (failed.length > 0) return { status: "partial", committed: true, failedEffects: failed };
    return { status: "completed" };
  });
}
