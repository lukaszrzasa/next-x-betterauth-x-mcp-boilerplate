import "server-only";

import { and, eq } from "drizzle-orm";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { fingerprintEncryptedSecret, manualKeyFromUri } from "@/src/lib/auth/factorCodec";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { db, twoFactor } from "@/src/lib/db";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/db/settings/password/verifyCurrentPassword";
import { lifecycleError, rethrowProviderPasswordError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import type { CurrentPasswordOnlySchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { SetupStarted } from "@/app/(AuthModule)/_/types/settings";
import { findFactor, loadFactorAccount, type FactorRow } from "./factors";
import { cancelPendingSetupRequests, consumeSetupInitiation, insertSetup, type SetupRequestRow } from "./setupRequests";

/** The provider creates the pending factor row (unverified) and returns its setup URI. */
async function enableThroughProvider(ctx: AuthedCtx, password: string): Promise<string> {
  let response: Awaited<ReturnType<typeof auth.api.enableTwoFactor>>;
  try {
    response = await auth.api.enableTwoFactor({
      body: { password, method: "totp" },
      headers: ctx.getRequestHeaders(),
    });
  } catch (error) {
    rethrowProviderPasswordError(error);
  }
  if (!("totpURI" in response) || typeof response.totpURI !== "string") {
    throw new Error("The provider did not return authenticator setup material.");
  }
  return response.totpURI;
}

/** Records the attempt against the provider's pending row; if that fails, the row is removed again (best effort). */
async function recordEnrollment(ctx: AuthedCtx, pending: FactorRow): Promise<SetupRequestRow> {
  try {
    return await insertSetup(ctx, {
      kind: "enroll",
      currentFactorId: pending.id,
      currentFactorFingerprint: fingerprintEncryptedSecret(pending.secret),
      authorizedSecurityVersion: securityVersionOf(ctx.user),
      replacementSecret: null,
    });
  } catch (error) {
    await db
      .delete(twoFactor)
      .where(and(eq(twoFactor.id, pending.id), eq(twoFactor.verified, false)))
      .catch(() => undefined);
    throw error;
  }
}

/**
 * Optional first enrollment: the provider's own enable/verify pair, staged
 * by an app-owned attempt so the factor stays inactive until a code proves
 * it. Nothing is active until `confirmEnrollment`.
 */
export async function beginEnrollment(ctx: AuthedCtx, input: CurrentPasswordOnlySchema): Promise<SetupStarted> {
  await verifyCurrentPassword(ctx, input.currentPassword);
  return withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const account = await loadFactorAccount(reads, ctx.user.id);
    const existing = await findFactor(reads, ctx.user.id);
    if (account.twoFactorEnabled || existing?.verified === true) {
      throw lifecycleError("CONFLICT", "INACTIVE", "An authenticator is already set up. Replace it instead.");
    }
    await assertSecurityStateCurrent(reads, ctx.user.id, securityVersionOf(ctx.user));
    await consumeSetupInitiation(ctx);
    // An earlier attempt goes first, with its unverified row: the provider
    // would otherwise reuse that row for the new secret, and the attempt
    // recorded below must point at a row nobody else can delete.
    await db.transaction((tx) => cancelPendingSetupRequests(ctx, tx, ctx.user.id));

    const totpUri = await enableThroughProvider(ctx, input.currentPassword);
    const pending = await findFactor(db, ctx.user.id);
    if (!pending || pending.verified !== false) {
      throw new Error("The pending authenticator row was not found after enabling.");
    }
    const request = await recordEnrollment(ctx, pending);
    return {
      status: "pending",
      requestId: request.id,
      kind: "enroll",
      expiresAt: request.expiresAt.toISOString(),
      totpUri,
      manualKey: manualKeyFromUri(totpUri),
    };
  });
}
