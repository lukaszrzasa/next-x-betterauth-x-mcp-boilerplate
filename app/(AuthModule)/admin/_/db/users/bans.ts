import "server-only";

import { and, count, not } from "drizzle-orm";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";
import { roleNames } from "@/src/lib/auth/permissions";
import {
  refreshCommittedUserSessions,
  revokeCurrentUserSessions,
} from "@/src/lib/auth/userSessionEffects";
import { user } from "@/src/lib/db";
import { retirePendingSecurityState } from "@/app/(AuthModule)/_/db/settings/shared/retirePendingSecurityState";
import { withUserAccountLock, type LockedReads } from "@/app/(AuthModule)/_/db/userAccountLock";
import { isEffectivelyBanned } from "@/app/(AuthModule)/admin/_/policy";
import type { BanUserSchema, UserTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import {
  BAN_DURATION_SECONDS,
  type FailedEffect,
  type UserMutationOutcome,
} from "@/app/(AuthModule)/admin/_/types";
import { attemptEffect, conclude, confirmCommitted, unchanged } from "./outcomes";
import { effectivelyBanned, hasRoleToken } from "./reads";
import { authorizeTargetAction, loadTarget } from "./targets";

/**
 * Applying, replacing and lifting bans. Every ban takes the global admin-ban
 * lock before the target lock and counts the effectively unbanned admins
 * under it, so two simultaneous bans cannot both pass the last-admin check.
 */

async function countUnbannedAdmins(reads: LockedReads, asOf: Date): Promise<number> {
  const [{ total }] = await reads
    .select({ total: count() })
    .from(user)
    .where(and(hasRoleToken("admin"), not(effectivelyBanned(asOf))));
  return total;
}

function lastAdminError(): ActionError {
  return new ActionError("FORBIDDEN", {
    message: "This is the last active admin account; it cannot be banned.",
    data: { reason: "last-admin" },
  });
}

export async function banUser(ctx: AuthedCtx, input: BanUserSchema): Promise<UserMutationOutcome> {
  return withUserAccountLock(
    ctx,
    input.userId,
    async (reads) => {
      const { target } = await authorizeTargetAction(ctx, reads, input.userId, "ban");
      const replacing = isEffectivelyBanned(target.accessStatus);

      // The invariant holds regardless of root protection: a malformed or
      // legacy state must never lose its last usable admin.
      if (roleNames(target.role).includes("admin") && !replacing) {
        if ((await countUnbannedAdmins(reads, new Date())) <= 1) throw lastAdminError();
      }

      const expiresIn = BAN_DURATION_SECONDS[input.duration];
      const startedAt = Date.now();
      // Same lock, before the provider write: a banned account keeps no
      // pending email request or staged factor setup, and its security
      // generation moves on. Failure here blocks the ban.
      await retirePendingSecurityState(ctx, target.id, "banned");
      try {
        // No expiry argument for a permanent ban; the plugin has no default expiry.
        await auth.api.banUser({
          body: {
            userId: target.id,
            banReason: input.reason,
            ...(expiresIn === null ? {} : { banExpiresIn: expiresIn }),
          },
          headers: ctx.getRequestHeaders(),
        });
      } catch (error) {
        await confirmCommitted(
          reads,
          target.id,
          (current) =>
            current.banReason === input.reason &&
            (expiresIn === null
              ? current.accessStatus === "permanently-banned"
              : current.accessStatus === "temporarily-banned" &&
                current.banExpires !== null &&
                current.banExpires.getTime() >= startedAt + expiresIn * 1000 - 60_000),
          error,
        );
      }

      // Observe the effective state the write produced rather than trusting the response.
      const after = await loadTarget(reads, target.id);
      const expected = expiresIn === null ? "permanently-banned" : "temporarily-banned";
      if (after.accessStatus !== expected) {
        throw new Error(`Ban write left user ${target.id} in state ${after.accessStatus}.`);
      }
      // TODO(audit): Persist users.ban.applied or users.ban.replaced (replaced
      // when a prior effective ban existed) after this confirmed write. Include
      // ctx.requestId, actor user ID, target user ID, UTC time, outcome, and a
      // diff of effective status, reason and expiry, plus whether it replaced a
      // prior ban. Record session-revocation failure separately from the
      // committed ban. Never include request headers, cookies, tokens or secrets.

      const failed: FailedEffect[] = [];
      await attemptEffect(ctx, "session-revocation", () => revokeCurrentUserSessions(target.id), failed);
      return conclude(target.id, true, failed);
    },
    { adminBan: true },
  );
}

/** Recovery after a partial ban: revoke sessions; expiry and reason are untouched. */
export async function retryBanSessions(
  ctx: AuthedCtx,
  input: UserTargetSchema,
): Promise<UserMutationOutcome> {
  return withUserAccountLock(ctx, input.userId, async (reads) => {
    const { target } = await authorizeTargetAction(ctx, reads, input.userId, "ban");
    if (!isEffectivelyBanned(target.accessStatus)) {
      throw new ActionError("FORBIDDEN", {
        message: "This user is not banned; there is nothing to finish.",
        data: { reason: "not-banned" },
      });
    }
    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-revocation", () => revokeCurrentUserSessions(target.id), failed);
    // TODO(audit): Persist users.session_sync.retried (effect: session-revocation)
    // with ctx.requestId, actor and target user IDs, UTC time and outcome only.
    return conclude(target.id, false, failed);
  });
}

export async function unbanUser(ctx: AuthedCtx, input: UserTargetSchema): Promise<UserMutationOutcome> {
  return withUserAccountLock(ctx, input.userId, async (reads) => {
    const { target, unchanged: active } = await authorizeTargetAction(ctx, reads, input.userId, "unban");
    if (active) return unchanged(target.id);

    try {
      await auth.api.unbanUser({
        body: { userId: target.id },
        headers: ctx.getRequestHeaders(),
      });
    } catch (error) {
      await confirmCommitted(reads, target.id, (current) => current.accessStatus === "active", error);
    }
    // TODO(audit): Persist users.ban.removed after this confirmed write. Include
    // ctx.requestId, actor user ID, target user ID, UTC time, outcome, and the
    // lifted ban's reason and expiry. Never include request headers, cookies,
    // tokens or secrets.

    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-refresh", () => refreshCommittedUserSessions(target.id), failed);
    return conclude(target.id, true, failed);
  });
}

export async function retryUnbanSessionRefresh(
  ctx: AuthedCtx,
  input: UserTargetSchema,
): Promise<UserMutationOutcome> {
  return withUserAccountLock(ctx, input.userId, async (reads) => {
    const { target } = await authorizeTargetAction(ctx, reads, input.userId, "unban");
    if (target.accessStatus !== "active") {
      throw new ActionError("FORBIDDEN", {
        message: "This user is still banned; there is nothing to refresh.",
        data: { reason: "banned" },
      });
    }
    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-refresh", () => refreshCommittedUserSessions(target.id), failed);
    // TODO(audit): Persist users.session_sync.retried (effect: session-refresh)
    // with ctx.requestId, actor and target user IDs, UTC time and outcome only.
    return conclude(target.id, false, failed);
  });
}
