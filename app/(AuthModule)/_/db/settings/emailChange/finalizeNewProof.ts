import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import type { PublicCtx } from "@/src/lib/auth/builders/context";
import { clearRevocationBarrier, isEffectivelyBanned } from "@/src/lib/auth/sessionAuthority";
import { revokeCurrentUserSessions } from "@/src/lib/auth/userSessionEffects";
import { db, emailChangeRequest, user, type EmailChangeCancelReason } from "@/src/lib/db";
import { errorMessage } from "@/src/lib/errorMessage";
import { isUniqueViolation } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { cancelPendingSetupRequests } from "@/app/(AuthModule)/_/db/settings/twoFactor/setupRequests";
import type { EmailProofOutcome } from "@/app/(AuthModule)/_/types/settings";
import { isExpired, markCancelled, markExpired, type EmailChangeRequestRow } from "./requests";

/**
 * Finalization: a narrowly scoped direct SQL exception.
 *
 * The application owns this proof protocol, and the account update and the
 * request consumption must commit together; the provider's self update API
 * has no notion of it. So, under the account lock, one write transaction
 * locks the user row and then the request row, validates only the locked
 * values, and writes exactly: email, emailVerified, passwordResetInvalidBefore,
 * updatedAt, securityVersion (+1) and sessionRevocationPending on the user;
 * the terminal state, proof timestamp, erased digests and the revocation
 * flag on the request. Root ID, role and factor data are never touched.
 * PostgreSQL's unique email is the final arbiter of a concurrent race.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type LockedAccount = { id: string; email: string; emailVerified: boolean; banned: boolean | null; banExpires: Date | null };
type Commit = { userId: string; version: number };
type Finalization = { outcome: EmailProofOutcome; commit?: Commit };

/** Why a matching, unexpired request can no longer commit, or `null` when it can. */
function cancellationReason(account: LockedAccount, row: EmailChangeRequestRow, now: Date): EmailChangeCancelReason | null {
  if (isEffectivelyBanned(account, now)) return "banned";
  if (account.email !== row.originalEmail) return "account_changed";
  if (row.kind === "change" && (row.currentConfirmedAt === null || !account.emailVerified)) return "account_changed";
  if (row.kind === "correction" && account.emailVerified) return "account_changed";
  return null;
}

async function destinationTaken(tx: Tx, email: string, ownerId: string): Promise<boolean> {
  const [taken] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), ne(user.id, ownerId)))
    .limit(1);
  return taken !== undefined;
}

/** One statement for the whitelisted account columns; the relative increment never rewinds a concurrent generation. */
async function writeNewAddress(tx: Tx, accountId: string, email: string, now: Date): Promise<number> {
  const bumped = await tx.execute<{ security_version: number }>(
    sql`UPDATE "user"
        SET email = ${email},
            email_verified = true,
            password_reset_invalid_before = ${now.toISOString()}::timestamp,
            updated_at = ${now.toISOString()}::timestamp,
            security_version = security_version + 1,
            session_revocation_pending = true
        WHERE id = ${accountId}
        RETURNING security_version`,
  );
  return Number(bumped.rows[0]?.security_version);
}

async function commitNewAddress(ctx: PublicCtx, requestId: string, hash: string, now: Date): Promise<Finalization> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select({ userId: emailChangeRequest.userId })
      .from(emailChangeRequest)
      .where(eq(emailChangeRequest.id, requestId))
      .limit(1);
    if (!request) return { outcome: { status: "inactive" } };

    // Always user first, then request.
    const [account] = await tx
      .select({
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        banned: user.banned,
        banExpires: user.banExpires,
      })
      .from(user)
      .where(eq(user.id, request.userId))
      .for("update");
    const [row] = await tx.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, requestId)).for("update");
    const newEmail = row?.newEmail;
    if (!account || !row || row.state !== "awaiting_new" || row.newTokenHash !== hash || !newEmail) {
      return { outcome: { status: "inactive" } };
    }
    if (isExpired(row, now)) {
      await markExpired(tx, row.id);
      return { outcome: { status: "expired" } };
    }
    const reason = cancellationReason(account, row, now);
    if (reason) {
      await markCancelled(tx, row.id, reason, now);
      return { outcome: { status: "account-changed" } };
    }
    if (newEmail === account.email || (await destinationTaken(tx, newEmail, account.id))) {
      await markCancelled(tx, row.id, "account_changed", now);
      return { outcome: { status: "destination-unavailable" } };
    }

    const version = await writeNewAddress(tx, account.id, newEmail, now);
    await tx
      .update(emailChangeRequest)
      .set({
        state: "completed",
        newConfirmedAt: now,
        completedAt: now,
        currentTokenHash: null,
        newTokenHash: null,
        sessionRevocationPending: true,
      })
      .where(eq(emailChangeRequest.id, row.id));
    await cancelPendingSetupRequests(ctx, tx, account.id);
    return {
      outcome: { status: "completed", sessionRevocationPending: true },
      commit: { userId: account.id, version },
    };
  });
}

/**
 * After the commit, still under the account lock, outside any transaction:
 * revoke and confirm, then clear the barrier for the generation observed.
 * Until then the barrier refuses every session of the account.
 */
async function revokeAfterCommit(ctx: PublicCtx, commit: Commit): Promise<EmailProofOutcome> {
  try {
    await revokeCurrentUserSessions(commit.userId);
    await clearRevocationBarrier(commit.userId, commit.version);
    return { status: "completed", sessionRevocationPending: false };
  } catch (error) {
    ctx.log.error("email changed; session revocation not confirmed, barrier retained", { error: errorMessage(error) });
    return { status: "completed", sessionRevocationPending: true };
  }
}

/** The new mailbox agreed: commit the address atomically, then sign every session out. */
export async function finalizeNewProof(ctx: PublicCtx, requestId: string, hash: string): Promise<EmailProofOutcome> {
  const now = new Date();
  let finalization: Finalization;
  try {
    finalization = await commitNewAddress(ctx, requestId, hash, now);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // The unique email lost a race the availability check could not see.
    await markCancelled(db, requestId, "account_changed", now);
    return { status: "destination-unavailable" };
  }
  if (!finalization.commit) return finalization.outcome;
  return revokeAfterCommit(ctx, finalization.commit);
}
