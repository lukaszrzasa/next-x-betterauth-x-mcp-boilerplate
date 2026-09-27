import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import {
  encryptFactorSecret,
  fingerprintEncryptedSecret,
  generateFactorSecret,
  manualKeyFromUri,
  totpUriFor,
} from "@/src/lib/auth/factorCodec";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/db/settings/password/verifyCurrentPassword";
import { lifecycleError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import type { CurrentPasswordOnlySchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { SetupStarted } from "@/app/(AuthModule)/_/types/settings";
import { findFactor, loadFactorAccount } from "./factors";
import { consumeSetupInitiation, insertSetup } from "./setupRequests";

/**
 * The safe replacement, step one: password and existing-factor step-up
 * admitted the actor; a new secret is staged here, encrypted, while the old
 * authenticator and its codes keep working until the new code is proven.
 */
export async function beginReplacement(ctx: AuthedCtx, input: CurrentPasswordOnlySchema): Promise<SetupStarted> {
  await verifyCurrentPassword(ctx, input.currentPassword);
  return withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const account = await loadFactorAccount(reads, ctx.user.id);
    const current = await findFactor(reads, ctx.user.id);
    if (!account.twoFactorEnabled || current?.verified !== true) {
      throw lifecycleError("CONFLICT", "INACTIVE", "No authenticator is set up yet. Set one up instead.");
    }
    await assertSecurityStateCurrent(reads, ctx.user.id, securityVersionOf(ctx.user));
    await consumeSetupInitiation(ctx);

    const secret = generateFactorSecret();
    const request = await insertSetup(ctx, {
      kind: "replace",
      currentFactorId: current.id,
      currentFactorFingerprint: fingerprintEncryptedSecret(current.secret),
      authorizedSecurityVersion: securityVersionOf(ctx.user),
      replacementSecret: await encryptFactorSecret(secret),
    });
    const totpUri = totpUriFor(secret, account.email);
    return {
      status: "pending",
      requestId: request.id,
      kind: "replace",
      expiresAt: request.expiresAt.toISOString(),
      totpUri,
      manualKey: manualKeyFromUri(totpUri),
    };
  });
}
