import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { fingerprintEncryptedSecret, manualKeyFromUri } from "@/src/lib/auth/factorCodec";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { deleteUnverifiedFactor, findFactor, type FactorRow } from "@/app/(AuthModule)/_/db/authenticator/factors";
import {
  cancelPendingSetups,
  insertSetup,
  type SetupRequestRow,
} from "@/app/(AuthModule)/_/db/authenticator/setupRequests";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { lifecycleError } from "@/app/(AuthModule)/_/errors/settings";
import { AUTHENTICATOR_SETUP_POLICY } from "@/app/(AuthModule)/_/policies/limits";
import { currentPasswordOnlySchema } from "@/app/(AuthModule)/_/schemas/settings";
import { consumeSetupInitiation } from "@/app/(AuthModule)/_/services/authenticator/setupBudgets";
import { rethrowProviderPasswordError } from "@/app/(AuthModule)/_/services/credentials/providerErrors";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/services/credentials/verifyCurrentPassword";
import type { SetupStarted } from "@/app/(AuthModule)/_/types/settings";
import { requireFactorAccount } from "./ownedSetup";

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
  const now = new Date();
  try {
    return await insertSetup(ctx, {
      kind: "enroll",
      currentFactorId: pending.id,
      currentFactorFingerprint: fingerprintEncryptedSecret(pending.secret),
      authorizedSecurityVersion: securityVersionOf(ctx.user),
      replacementSecret: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + AUTHENTICATOR_SETUP_POLICY.setupTtlMs),
    });
  } catch (error) {
    await deleteUnverifiedFactor(ctx, pending.id).catch(() => undefined);
    throw error;
  }
}

/**
 * Optional first enrollment: the provider's own enable/verify pair, staged
 * by an app-owned attempt so the factor stays inactive until a code proves
 * it. Initial enrollment cannot require a factor that does not exist yet,
 * so the password is the proof. Nothing is active until the enrollment is
 * confirmed.
 */
export const beginEnrollmentOperation = defineAction({
  name: "settings.authenticator.beginEnrollment",
  schema: currentPasswordOnlySchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<SetupStarted> => {
    await verifyCurrentPassword(ctx, input.currentPassword);

    // Security lock: the provider creates the pending factor row and the
    // attempt is bound to it in a second commit. A confirmation, cancellation
    // or another start in between would act on a half-recorded attempt.
    return withAccountSecurityLock(ctx, ctx.user.id, async () => {
      const account = await requireFactorAccount(ctx);
      const existing = await findFactor(ctx);
      if (account.twoFactorEnabled || existing?.verified === true) {
        throw lifecycleError("CONFLICT", "INACTIVE", "An authenticator is already set up. Replace it instead.");
      }
      await assertSecurityStateCurrent(ctx.user.id, securityVersionOf(ctx.user));
      await consumeSetupInitiation(ctx);

      // An earlier attempt goes first, with its unverified row: the provider
      // would otherwise reuse that row for the new secret, and the attempt
      // recorded below must point at a row nobody else can delete.
      await cancelPendingSetups(ctx, new Date());

      const totpUri = await enableThroughProvider(ctx, input.currentPassword);
      const pending = await findFactor(ctx);
      if (!pending || pending.verified !== false) {
        throw new Error("The pending authenticator row was not found after enabling.");
      }
      const setup = await recordEnrollment(ctx, pending);

      return {
        status: "pending",
        requestId: setup.id,
        kind: "enroll",
        expiresAt: setup.expiresAt.toISOString(),
        totpUri,
        manualKey: manualKeyFromUri(totpUri),
      };
    });
  },
});
