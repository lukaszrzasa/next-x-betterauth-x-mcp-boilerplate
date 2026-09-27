import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { verifyStepUp } from "@/src/lib/auth/stepUp";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/db/settings/password/verifyCurrentPassword";
import { fieldError, lifecycleError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import type { BeginEmailCorrectionSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { EmailRequestOutcome } from "@/app/(AuthModule)/_/types/settings";
import { deliverLink } from "./delivery";
import { addressUnchangedError } from "./errors";
import { consumeEmailInitiation } from "./initiation";
import { assertAddressAvailable, loadOwner } from "./owner";
import { pendingOutcome } from "./projection";
import { createRequest } from "./requests";
import { issueToken } from "./tokens";

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
      "This account has no authenticator; submit again without a code.",
    );
  }
  if (code === undefined) {
    throw fieldError(
      "INVALID_INPUT",
      "authenticatorCode",
      "AUTHENTICATOR_CODE_REQUIRED",
      "Enter the current code from your authenticator app.",
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
 */
export async function beginEmailCorrection(
  ctx: AuthedCtx,
  input: BeginEmailCorrectionSchema,
): Promise<EmailRequestOutcome> {
  await verifyCurrentPassword(ctx, input.currentPassword);
  await verifyAuthenticatorCode(ctx, input.authenticatorCode);
  const { token, hash } = issueToken();

  const row = await withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const owner = await loadOwner(reads, ctx.user.id);
    if (owner.emailVerified) {
      throw lifecycleError("CONFLICT", "INACTIVE", "Your address is verified; use Change email instead.");
    }
    if (input.newEmail === owner.email) throw addressUnchangedError();
    await assertAddressAvailable(reads, input.newEmail, ctx.user.id);
    await assertSecurityStateCurrent(reads, ctx.user.id, securityVersionOf(ctx.user));
    await consumeEmailInitiation(ctx);
    return createRequest(ctx, {
      kind: "correction",
      state: "awaiting_new",
      originalEmail: owner.email,
      newEmail: input.newEmail,
      currentTokenHash: null,
      newTokenHash: hash,
    });
  });

  const delivery = await deliverLink(ctx, { to: input.newEmail, purpose: "new", token, expiresAt: row.expiresAt });
  return pendingOutcome(row, delivery);
}
