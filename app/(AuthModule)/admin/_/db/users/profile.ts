import "server-only";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import {
  refreshCommittedUserSessions,
  revokeCurrentUserSessions,
} from "@/src/lib/auth/userSessionEffects";
import { retirePendingSecurityState } from "@/app/(AuthModule)/_/db/settings/shared/retirePendingSecurityState";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import type {
  UpdateUserEmailSchema,
  UpdateUserNameSchema,
  UserTargetSchema,
} from "@/app/(AuthModule)/admin/_/schema";
import type { FailedEffect, UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { requestVerificationEmail } from "./emails";
import { attemptEffect, conclude, confirmCommitted, unchanged } from "./outcomes";
import { authorizeTargetAction, type Target } from "./targets";
import { consumeAdminEmailAttempt } from "./throttle";

/**
 * Name and email changes, each a single whitelisted provider write under the
 * account lock, followed by explicit, observed session effects. The email
 * change also verifies the new address after the lock is released.
 */

export async function updateUserName(
  ctx: AuthedCtx,
  input: UpdateUserNameSchema,
): Promise<UserMutationOutcome> {
  return withUserAccountLock(ctx, input.userId, async (reads) => {
    const { target } = await authorizeTargetAction(ctx, reads, input.userId, "updateName");
    if (target.name === input.name) return unchanged(target.id);

    try {
      // A whitelist of exactly one field: nothing else on the row is touched.
      await auth.api.adminUpdateUser({
        body: { userId: target.id, data: { name: input.name } },
        headers: ctx.getRequestHeaders(),
      });
    } catch (error) {
      await confirmCommitted(reads, target.id, (current) => current.name === input.name, error);
    }
    // TODO(audit): Persist users.name.updated after this confirmed write. Include
    // ctx.requestId, actor user ID, target user ID, UTC time, outcome, and an
    // allowlisted before/after diff for name. Record partial failure separately
    // from committed success. Never include request headers, cookies,
    // passwords, session/reset/verification tokens, OTP values, or
    // factor/recovery secrets.

    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-refresh", () => refreshCommittedUserSessions(target.id), failed);
    return conclude(target.id, true, failed);
  });
}

export async function retryNameSessionRefresh(
  ctx: AuthedCtx,
  input: UserTargetSchema,
): Promise<UserMutationOutcome> {
  return withUserAccountLock(ctx, input.userId, async (reads) => {
    const { target } = await authorizeTargetAction(ctx, reads, input.userId, "updateName");
    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-refresh", () => refreshCommittedUserSessions(target.id), failed);
    // TODO(audit): Persist users.session_sync.retried (effect: session-refresh)
    // with ctx.requestId, actor and target user IDs, UTC time and outcome only.
    return conclude(target.id, false, failed);
  });
}


/** After a committed address change: revoke, then verify the *new* address. */
async function runEmailChangeEffects(
  ctx: AuthedCtx,
  target: Target,
  failed: FailedEffect[],
): Promise<void> {
  await attemptEffect(ctx, "session-revocation", () => revokeCurrentUserSessions(target.id), failed);
}

async function requestVerificationForCurrentEmail(
  ctx: AuthedCtx,
  target: Pick<Target, "id" | "email">,
  failed: FailedEffect[],
): Promise<void> {
  await attemptEffect(
    ctx,
    "verification-email",
    async () => {
      await consumeAdminEmailAttempt(ctx, "verification", target.id);
      await requestVerificationEmail(ctx, target.email);
    },
    failed,
  );
}

export async function updateUserEmail(
  ctx: AuthedCtx,
  input: UpdateUserEmailSchema,
): Promise<UserMutationOutcome> {
  const failed: FailedEffect[] = [];
  const committed = await withUserAccountLock(ctx, input.userId, async (reads) => {
    const { target } = await authorizeTargetAction(ctx, reads, input.userId, "updateEmail");
    if (target.email === input.email) return null;

    const now = new Date();
    // Before the credential-bearing write, under the lock already held:
    // retire the target's pending email requests and staged factor setups
    // and move its security generation on. A failure here blocks the change
    // rather than leaving an old request able to complete afterwards.
    await retirePendingSecurityState(ctx, target.id, "admin_change");
    try {
      // One provider write carries every related column: the address, the
      // verification reset and the cutoff that retires older reset links.
      await auth.api.adminUpdateUser({
        body: {
          userId: target.id,
          data: { email: input.email, emailVerified: false, passwordResetInvalidBefore: now },
        },
        headers: ctx.getRequestHeaders(),
      });
    } catch (error) {
      await confirmCommitted(reads, target.id, (current) => current.email === input.email, error);
    }
    // TODO(audit): Persist users.email.updated after this confirmed write. Include
    // ctx.requestId, actor user ID, target user ID, UTC time, outcome, and the
    // old and new email address (deliberately classified audit PII), plus that
    // verification was reset. Record partial failure of the follow-up effects
    // separately from the committed change. Never include request headers,
    // cookies, passwords, session/reset/verification tokens, OTP values, or
    // factor/recovery secrets.

    const changed = { ...target, email: input.email, emailVerified: false };
    await runEmailChangeEffects(ctx, changed, failed);
    return changed;
  });
  if (!committed) return unchanged(input.userId);

  // Outside the lock: sending mail must never hold up other account actions.
  await requestVerificationForCurrentEmail(ctx, committed, failed);
  return conclude(committed.id, true, failed);
}

/**
 * Recovery after a partial email change: revoke whatever sessions exist now
 * and request verification for the *current* address if it is still
 * unverified. No address or cutoff is written; nothing from the failed
 * request is replayed.
 */
export async function retryEmailChangeEffects(
  ctx: AuthedCtx,
  input: UserTargetSchema,
): Promise<UserMutationOutcome> {
  const failed: FailedEffect[] = [];
  const target = await withUserAccountLock(ctx, input.userId, async (reads) => {
    const { target } = await authorizeTargetAction(ctx, reads, input.userId, "updateEmail");
    await runEmailChangeEffects(ctx, target, failed);
    return target;
  });
  if (!target.emailVerified) await requestVerificationForCurrentEmail(ctx, target, failed);
  // TODO(audit): Persist users.session_sync.retried (effects: session-revocation,
  // verification-email) with ctx.requestId, actor and target user IDs, UTC time
  // and per-effect outcome only.
  return conclude(target.id, false, failed);
}
