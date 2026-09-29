import "server-only";

import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";
import { incrementSecurityVersion } from "@/src/lib/auth/securityVersion";
import { db } from "@/src/lib/db";
import { cancelPendingSetupsWith } from "@/app/(AuthModule)/_/db/authenticator/setupRequests";
import { cancelActiveRequestsWhere } from "@/app/(AuthModule)/_/db/emailRequests/transitions";

/** Why the pending state goes; recorded on the cancelled email request. */
export type SecurityStateRetirementReason = "credentials" | "admin_change" | "banned";

/**
 * One write transaction: every pending email request and staged factor
 * setup of the account is retired, and the account moves to its next
 * security generation. Returns that generation.
 */
export async function retirePendingSecurityState(
  _ctx: AuthedCtx | PublicCtx,
  userId: string,
  reason: SecurityStateRetirementReason,
): Promise<number> {
  return db.transaction(async (tx) => {
    await cancelActiveRequestsWhere(tx, userId, reason);
    await cancelPendingSetupsWith(tx, userId, new Date());
    return incrementSecurityVersion(userId, tx);
  });
}

/**
 * The factor half alone, for turning the authenticator off: the actor's
 * staged setup is retired and the generation moves on together.
 */
export async function retirePendingSetups(ctx: AuthedCtx): Promise<number> {
  return db.transaction(async (tx) => {
    await cancelPendingSetupsWith(tx, ctx.user.id, new Date());
    return incrementSecurityVersion(ctx.user.id, tx);
  });
}

/** Moves the actor's account to its next security generation, by itself. */
export function advanceSecurityVersion(ctx: AuthedCtx): Promise<number> {
  return incrementSecurityVersion(ctx.user.id, db);
}
