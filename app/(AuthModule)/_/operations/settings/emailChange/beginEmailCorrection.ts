import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { verifyStepUp } from "@/src/lib/auth/stepUp";
import { isAddressTaken } from "@/app/(AuthModule)/_/db/emailRequests/owner";
import { replaceActiveRequest } from "@/app/(AuthModule)/_/db/emailRequests/requests";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { addressUnavailableError, addressUnchangedError } from "@/app/(AuthModule)/_/errors/emailRequest";
import { fieldError, lifecycleError } from "@/app/(AuthModule)/_/errors/settings";
import { EMAIL_CHANGE_POLICY } from "@/app/(AuthModule)/_/policies/limits";
import { beginEmailCorrectionSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/services/credentials/verifyCurrentPassword";
import { consumeEmailInitiation } from "@/app/(AuthModule)/_/services/email/budgets";
import { deliverLink } from "@/app/(AuthModule)/_/services/email/delivery";
import { issueToken } from "@/app/(AuthModule)/_/services/email/tokens";
import type { EmailRequestOutcome } from "@/app/(AuthModule)/_/types/settings";
import { requireEmailOwner } from "./ownedRequest";
import { pendingOutcome } from "./pendingRequest";

/**
 * An enrolled account proves the correction with a fresh authenticator code
 * (`persistGrant: false`, the existing attempt budget); an account without
 * one must not send a code at all, so a stale form cannot slip one past.
 */
async function verifyAuthenticatorCode(ctx: AuthedCtx, code: string | undefined): Promise<void> {
  if (!ctx.user.twoFactorEnabled) {
    if (code === undefined) return;
    throw fieldError(
      "INVALID_INPUT",
      "authenticatorCode",
      "AUTHENTICATOR_NOT_ENROLLED",
      { key: "auth.errors.authenticatorNotEnrolled" },
    );
  }
  if (code === undefined) {
    throw fieldError(
      "INVALID_INPUT",
      "authenticatorCode",
      "AUTHENTICATOR_CODE_REQUIRED",
      { key: "auth.errors.authenticatorCodeRequired" },
    );
  }
  await verifyStepUp({
    user: ctx.user,
    scope: { userId: ctx.user.id, sessionId: ctx.session.id },
    headers: ctx.getRequestHeaders(),
    proof: { method: "totp", code },
    persistGrant: false,
  });
}

/**
 * A correction of an unverified address: the corrected mailbox is the only
 * proof, and nothing is ever mailed to the incorrect address.
 *
 * Deliberately outside the shared step-up (`none`, no verified-email
 * requirement), because the ordinary step-up refuses an unverified address:
 * the password and, for an enrolled account, the authenticator code are
 * verified here instead. Root follows the same rules.
 */
export const beginEmailCorrectionOperation = defineAction({
  name: "settings.emailCorrection.begin",
  schema: beginEmailCorrectionSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<EmailRequestOutcome> => {
    await verifyCurrentPassword(ctx, input.currentPassword);
    await verifyAuthenticatorCode(ctx, input.authenticatorCode);
    const { token, hash } = issueToken();

    // Security lock: as for a change, a request must not be stored between
    // another operation's retirement of pending requests and its provider write.
    const request = await withAccountSecurityLock(ctx, ctx.user.id, async () => {
      const owner = await requireEmailOwner(ctx);
      if (owner.emailVerified) {
        throw lifecycleError("CONFLICT", "INACTIVE", { key: "auth.errors.useChangeEmail" });
      }
      if (input.newEmail === owner.email) throw addressUnchangedError();
      if (await isAddressTaken(ctx, input.newEmail)) throw addressUnavailableError();
      await assertSecurityStateCurrent(ctx.user.id, securityVersionOf(ctx.user));
      await consumeEmailInitiation(ctx);

      const now = new Date();
      return replaceActiveRequest(ctx, {
        kind: "correction",
        state: "awaiting_new",
        originalEmail: owner.email,
        newEmail: input.newEmail,
        currentTokenHash: null,
        newTokenHash: hash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + EMAIL_CHANGE_POLICY.requestTtlMs),
      });
    });

    const delivery = await deliverLink(ctx, {
      to: input.newEmail,
      purpose: "new",
      token,
      expiresAt: request.expiresAt,
    });
    return pendingOutcome(ctx, request, delivery);
  },
});
