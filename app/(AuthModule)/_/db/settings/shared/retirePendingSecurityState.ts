import "server-only";

import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";
import { incrementSecurityVersion } from "@/src/lib/auth/securityVersion";
import { db } from "@/src/lib/db";
import { cancelActiveEmailRequests } from "@/app/(AuthModule)/_/db/settings/emailChange/cancellation";
import { cancelPendingSetupRequests } from "@/app/(AuthModule)/_/db/settings/twoFactor/setupRequests";

export type SecurityStateRetirementReason = "credentials" | "admin_change" | "banned";

/**
 * Under the caller's account lock, in one write transaction: retire every
 * pending email request and staged factor setup, then move the account to
 * its next security generation. Runs *before* the credential or
 * administrative write; the retirement stands even if that write fails.
 */
export async function retirePendingSecurityState(
  ctx: AuthedCtx | PublicCtx,
  userId: string,
  reason: SecurityStateRetirementReason,
): Promise<number> {
  return db.transaction(async (tx) => {
    await cancelActiveEmailRequests(ctx, tx, userId, reason);
    await cancelPendingSetupRequests(ctx, tx, userId);
    return incrementSecurityVersion(tx, userId);
  });
}
