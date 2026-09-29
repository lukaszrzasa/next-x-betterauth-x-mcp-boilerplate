import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { roleNames, STAFF_ROLES } from "@/src/lib/auth/permissions";
import { revokeCurrentUserSessions } from "@/src/lib/auth/userSessionEffects";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { retirePendingSecurityState } from "@/app/(AuthModule)/_/db/security/retirement";
import { countUnbannedAdmins } from "@/app/(AuthModule)/admin/_/db/users/targets";
import { lastAdminError } from "@/app/(AuthModule)/admin/_/errors";
import { isEffectivelyBanned } from "@/app/(AuthModule)/admin/_/policy";
import { banUserSchema, type BanUserSchema } from "@/app/(AuthModule)/admin/_/schema";
import { attemptEffect, conclude } from "@/app/(AuthModule)/admin/_/services/effects";
import { banned, logged, type UserLogEntry } from "@/app/(AuthModule)/admin/_/services/staffLog";
import {
  BAN_DURATION_SECONDS,
  type FailedEffect,
  type UserMutationOutcome,
} from "@/app/(AuthModule)/admin/_/types";
import { authorizeTargetAction, loadTarget, type Target } from "./authorizeTarget";
import { confirmCommitted } from "./confirmCommitted";

/** How far a committed expiry may trail the one computed here before it is not this request's. */
const EXPIRY_TOLERANCE_MS = 60_000;

/**
 * The provider's ban. A thrown result whose ban nonetheless committed (this
 * reason, this duration counted from `startedAt`) counts as written.
 */
async function banThroughProvider(ctx: AuthedCtx, target: Target, input: BanUserSchema): Promise<void> {
  const expiresIn = BAN_DURATION_SECONDS[input.duration];
  const startedAt = Date.now();
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
      ctx,
      target.id,
      (current) => {
        if (current.banReason !== input.reason) return false;
        if (expiresIn === null) return current.accessStatus === "permanently-banned";
        return (
          current.accessStatus === "temporarily-banned" &&
          current.banExpires !== null &&
          current.banExpires.getTime() >= startedAt + expiresIn * 1000 - EXPIRY_TOLERANCE_MS
        );
      },
      error,
    );
  }
}

/**
 * Applies a ban, or replaces the one in force (durations count from now).
 * Five-minute step-up. The account's sessions are revoked, and its pending
 * email requests and factor setups are retired.
 */
export const banUserOperation = defineAction({
  name: "users.ban",
  schema: banUserSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.ban"],
  mcpAllowed: false,
  stepUp: "five_minutes",
  handler: async (ctx, input): Promise<UserMutationOutcome> => {
    let entry: UserLogEntry | undefined;

    // Two locks, always in this order. Global admin-ban lock: the count of
    // usable admins and the ban must not interleave with another ban, or two
    // bans could each see the other's target as the remaining admin. Target
    // security lock: retirement and the provider's ban commit separately.
    const outcome = await withAccountSecurityLock(
      ctx,
      input.userId,
      async () => {
        const { target } = await authorizeTargetAction(ctx, input.userId, "ban");
        const replacing = isEffectivelyBanned(target.accessStatus);

        // The invariant holds regardless of root protection: a malformed or
        // legacy state must never lose its last usable admin.
        const removesAnAdmin = roleNames(target.role).includes("admin") && !replacing;
        if (removesAnAdmin && (await countUnbannedAdmins(ctx, new Date())) <= 1) throw lastAdminError();

        // Committed before the provider write; a failure here blocks the ban.
        await retirePendingSecurityState(ctx, target.id, "banned");
        await banThroughProvider(ctx, target, input);

        // Observe the effective state the write produced rather than trusting the response.
        const after = await loadTarget(ctx, target.id);
        const expected = input.duration === "permanent" ? "permanently-banned" : "temporarily-banned";
        if (after.accessStatus !== expected) {
          throw new Error(`Ban write left user ${target.id} in state ${after.accessStatus}.`);
        }

        const failed: FailedEffect[] = [];
        await attemptEffect(ctx, "session-revocation", () => revokeCurrentUserSessions(target.id), failed);
        // The ban as observed, not as requested.
        entry = banned(target, { replacing, expires: after.banExpires, reason: after.banReason });
        return conclude(target.id, true, failed);
      },
      { adminBan: true },
    );

    // Logged after the locks: the write is confirmed, and the entry must not hold up the account.
    return logged(ctx, outcome, entry);
  },
});
