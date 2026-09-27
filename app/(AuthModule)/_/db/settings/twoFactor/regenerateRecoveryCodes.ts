import "server-only";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { assertSecurityStateCurrent, incrementSecurityVersion, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { db } from "@/src/lib/db";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/db/settings/password/verifyCurrentPassword";
import { lifecycleError, rethrowProviderPasswordError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { discardStepUpState } from "@/app/(AuthModule)/_/db/settings/shared/sessionEffects";
import type { CurrentPasswordOnlySchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { RecoveryCodesIssued } from "@/app/(AuthModule)/_/types/settings";
import { findFactor, loadFactorAccount } from "./factors";

async function generateThroughProvider(ctx: AuthedCtx, password: string): Promise<string[]> {
  try {
    const response = await auth.api.generateBackupCodes({ body: { password }, headers: ctx.getRequestHeaders() });
    return response.backupCodes;
  } catch (error) {
    rethrowProviderPasswordError(error);
  }
}

/** A new set of recovery codes, through the provider; every earlier code stops working. */
export async function regenerateRecoveryCodes(
  ctx: AuthedCtx,
  input: CurrentPasswordOnlySchema,
): Promise<RecoveryCodesIssued> {
  await verifyCurrentPassword(ctx, input.currentPassword);
  return withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const account = await loadFactorAccount(reads, ctx.user.id);
    const factor = await findFactor(reads, ctx.user.id);
    if (!account.twoFactorEnabled || factor?.verified !== true) {
      throw lifecycleError("CONFLICT", "INACTIVE", "No authenticator is set up; there are no recovery codes to replace.");
    }
    await assertSecurityStateCurrent(reads, ctx.user.id, securityVersionOf(ctx.user));
    await incrementSecurityVersion(db, ctx.user.id);
    const recoveryCodes = await generateThroughProvider(ctx, input.currentPassword);
    // TODO(audit): Persist settings.recovery_codes.regenerated after the
    // provider's write (actor user ID, UTC time). Never the codes.
    await discardStepUpState(ctx);
    return { status: "completed", recoveryCodes, issuedAt: new Date().toISOString(), failedEffects: [] };
  });
}
