import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import {
  encryptFactorSecret,
  fingerprintEncryptedSecret,
  generateFactorSecret,
  manualKeyFromUri,
  totpUriFor,
} from "@/src/lib/auth/factorCodec";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { findFactor } from "@/app/(AuthModule)/_/db/authenticator/factors";
import { insertSetup } from "@/app/(AuthModule)/_/db/authenticator/setupRequests";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { lifecycleError } from "@/app/(AuthModule)/_/errors/settings";
import { AUTHENTICATOR_SETUP_POLICY } from "@/app/(AuthModule)/_/policies/limits";
import { currentPasswordOnlySchema } from "@/app/(AuthModule)/_/schemas/settings";
import { consumeSetupInitiation } from "@/app/(AuthModule)/_/services/authenticator/setupBudgets";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/services/credentials/verifyCurrentPassword";
import type { SetupStarted } from "@/app/(AuthModule)/_/types/settings";
import { requireFactorAccount } from "./ownedSetup";

/**
 * The safe replacement, step one: the password and the existing factor's
 * step-up admitted the actor (declared enrolled-only, so an account without
 * a factor gets the closed refusal below instead of an email-code prompt).
 * A new secret is staged, encrypted, while the old authenticator and its
 * codes keep working until the new code is proven.
 */
export const beginReplacementOperation = defineAction({
  name: "settings.authenticator.beginReplacement",
  schema: currentPasswordOnlySchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: async (ctx, input): Promise<SetupStarted> => {
    await verifyCurrentPassword(ctx, input.currentPassword);

    // Security lock: the attempt is bound to the factor and generation read
    // here. Disabling, regenerating codes or a credential change must not
    // run between that read and the stored attempt.
    return withAccountSecurityLock(ctx, ctx.user.id, async () => {
      const account = await requireFactorAccount(ctx);
      const current = await findFactor(ctx);
      if (!account.twoFactorEnabled || current?.verified !== true) {
        throw lifecycleError("CONFLICT", "INACTIVE", "No authenticator is set up yet. Set one up instead.");
      }
      await assertSecurityStateCurrent(ctx.user.id, securityVersionOf(ctx.user));
      await consumeSetupInitiation(ctx);

      const secret = generateFactorSecret();
      const now = new Date();
      const setup = await insertSetup(ctx, {
        kind: "replace",
        currentFactorId: current.id,
        currentFactorFingerprint: fingerprintEncryptedSecret(current.secret),
        authorizedSecurityVersion: securityVersionOf(ctx.user),
        replacementSecret: await encryptFactorSecret(secret),
        createdAt: now,
        expiresAt: new Date(now.getTime() + AUTHENTICATOR_SETUP_POLICY.setupTtlMs),
      });

      const totpUri = totpUriFor(secret, account.email);
      return {
        status: "pending",
        requestId: setup.id,
        kind: "replace",
        expiresAt: setup.expiresAt.toISOString(),
        totpUri,
        manualKey: manualKeyFromUri(totpUri),
      };
    });
  },
});
