import "server-only";

import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";
import { db, type EmailChangeCancelReason } from "@/src/lib/db";
import { cancelActiveRequestsWhere, type RequestWriter } from "./requests";

/**
 * Retires the user's active request, whatever its stage, erasing its proof
 * digests. For the credential and administrative paths, which already hold
 * the account lock and run this inside their write transaction.
 */
export async function cancelActiveEmailRequests(
  _ctx: AuthedCtx | PublicCtx,
  tx: RequestWriter,
  userId: string,
  reason: EmailChangeCancelReason,
): Promise<number> {
  const cancelled = await cancelActiveRequestsWhere(tx, userId, reason);
  // TODO(audit): Persist settings.email_request.cancelled per row (reason, UTC time).
  return cancelled;
}

/**
 * Provider hook (`emailVerification.afterEmailVerification`): once the
 * ordinary flow verified an address, a pending correction of it must not
 * remain. One conditional statement, no application context exists in that
 * hook, and no authority is decided here: finalization re-reads the locked
 * user row and refuses a correction for a verified address regardless.
 */
export async function cancelCorrectionsForVerifiedAddress(userId: string): Promise<void> {
  await cancelActiveRequestsWhere(db, userId, "account_changed", "correction");
}
