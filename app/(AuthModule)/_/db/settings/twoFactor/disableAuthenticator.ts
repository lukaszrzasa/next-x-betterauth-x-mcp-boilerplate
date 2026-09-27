import "server-only";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";
import { assertSecurityStateCurrent, incrementSecurityVersion, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { db } from "@/src/lib/db";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/db/settings/password/verifyCurrentPassword";
import { incorrectPasswordError, providerErrorCode } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { discardStepUpState } from "@/app/(AuthModule)/_/db/settings/shared/sessionEffects";
import type { CurrentPasswordOnlySchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";
import { enrollmentRequiredFor, loadFactorAccount } from "./factors";
import { cancelPendingSetupRequests } from "./setupRequests";

const enrollmentRequiredError = () =>
  new ActionError("FORBIDDEN", {
    message: "Your account is required to keep an authenticator; it cannot be disabled.",
    data: { reason: "enrollment-required" },
  });

/**
 * The provider removes its row, clears the flag, rotates the current
 * session and drops this device's trust record; nothing broader is claimed.
 * A thrown result whose effect nonetheless took (the flag is off) counts.
 */
async function disableThroughProvider(ctx: AuthedCtx, password: string): Promise<void> {
  try {
    await auth.api.disableTwoFactor({ body: { password }, headers: ctx.getRequestHeaders() });
  } catch (error) {
    if (providerErrorCode(error) === "INVALID_PASSWORD") throw incorrectPasswordError(error);
    if ((await loadFactorAccount(db, ctx.user.id)).twoFactorEnabled) throw error;
  }
}

/** Turns the authenticator off when neither the staff role nor the stored policy requires it. */
export async function disableAuthenticator(ctx: AuthedCtx, input: CurrentPasswordOnlySchema): Promise<SyncOutcome> {
  await verifyCurrentPassword(ctx, input.currentPassword);
  return withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const account = await loadFactorAccount(reads, ctx.user.id);
    if (!account.twoFactorEnabled) return { status: "unchanged" };
    if (enrollmentRequiredFor(account)) throw enrollmentRequiredError();
    await assertSecurityStateCurrent(reads, ctx.user.id, securityVersionOf(ctx.user));
    await db.transaction(async (tx) => {
      await cancelPendingSetupRequests(ctx, tx, ctx.user.id);
      await incrementSecurityVersion(tx, ctx.user.id);
    });
    await disableThroughProvider(ctx, input.currentPassword);
    // TODO(audit): Persist settings.factor.disabled after the confirmed write
    // (actor user ID, UTC time). Never include the password.
    await discardStepUpState(ctx);
    return { status: "completed" };
  });
}
