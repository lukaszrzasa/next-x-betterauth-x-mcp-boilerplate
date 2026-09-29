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
import { emailUpdated, logged, nameUpdated, sessionsRetried, type UserLogEntry } from "./staffLog";
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
  let entry: UserLogEntry | undefined;
  const outcome = await withUserAccountLock(ctx, input.userId, async (reads) => {
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

    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-refresh", () => refreshCommittedUserSessions(target.id), failed);
    entry = nameUpdated({ id: target.id, name: input.name }, target.name);
    return conclude(target.id, true, failed);
  });
  // Logged after the lock: the write is confirmed, and the entry must not hold up the account.
  return logged(ctx, outcome, entry);
}

export async function retryNameSessionRefresh(
  ctx: AuthedCtx,
  input: UserTargetSchema,
): Promise<UserMutationOutcome> {
  let entry: UserLogEntry | undefined;
  const outcome = await withUserAccountLock(ctx, input.userId, async (reads) => {
    const { target } = await authorizeTargetAction(ctx, reads, input.userId, "updateName");
    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-refresh", () => refreshCommittedUserSessions(target.id), failed);
    if (failed.length === 0) entry = sessionsRetried(target, "session refresh");
    return conclude(target.id, false, failed);
  });
  return logged(ctx, outcome, entry);
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

    const changed = { ...target, email: input.email, emailVerified: false };
    await runEmailChangeEffects(ctx, changed, failed);
    return { before: target, changed };
  });
  if (!committed) return unchanged(input.userId);

  // Outside the lock: sending mail must never hold up other account actions.
  await requestVerificationForCurrentEmail(ctx, committed.changed, failed);
  return logged(
    ctx,
    conclude(committed.changed.id, true, failed),
    emailUpdated(committed.changed, committed.before.email, input.email),
  );
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
  return logged(
    ctx,
    conclude(target.id, false, failed),
    failed.length === 0 ? sessionsRetried(target, "session sign-out") : undefined,
  );
}
