import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import type { PublicCtx } from "@/src/lib/auth/builders/context";
import { db, emailChangeRequest, user } from "@/src/lib/db";
import { uniqueViolationConstraint } from "@/src/lib/postgresErrors";
import { cancelPendingSetupsWith } from "@/app/(AuthModule)/_/db/authenticator/setupRequests";
import type { EmailChangeRequestRow, EmailRequestCancelReason } from "./requests";
import { markCancelledWith } from "./transitions";

/**
 * Finalization of an email change: a narrowly scoped direct SQL exception.
 *
 * The application owns this proof protocol, and the account update and the
 * request consumption must commit together; the provider's self update API
 * has no notion of it. One write transaction locks the user row and then
 * the request row (always in that order) and hands both to the caller's
 * `decide`, which validates the locked values and picks one of the writes
 * below. Whatever `decide` returns commits with the write it made:
 * returning after `expire` or `cancel` keeps that transition, throwing
 * rolls it back.
 *
 * `commitNewAddress` writes exactly: email, emailVerified,
 * passwordResetInvalidBefore, updatedAt, securityVersion (+1) and
 * sessionRevocationPending on the user; the terminal state, proof
 * timestamps, erased digests and the revocation flag on the request; and
 * retires the account's pending authenticator setup. Root ID, role and
 * factor data are never touched.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LockedAccount = {
  id: string;
  email: string;
  emailVerified: boolean;
  banned: boolean | null;
  banExpires: Date | null;
};

type LockedRows = { account: LockedAccount; request: EmailChangeRequestRow };

/** The writes `decide` may make; each runs in the finalization transaction. */
export type FinalizationWrites = {
  expire(): Promise<void>;
  cancel(reason: EmailRequestCancelReason): Promise<void>;
  isTakenByAnotherAccount(email: string): Promise<boolean>;
  /** Returns the account's security version after the write. */
  commitNewAddress(email: string): Promise<number>;
};

/** Both rows as locked, with the writes bound to the same transaction. */
export type LockedFinalization = LockedRows & { writes: FinalizationWrites };

export type Finalized<T> = { conflict: false; result: T } | { conflict: true };

/** The constraint PostgreSQL arbitrates a concurrent claim of the same address with. */
const USER_EMAIL_UNIQUE = "user_email_unique";

async function lockRows(tx: Tx, requestId: string): Promise<LockedRows | null> {
  const [owner] = await tx
    .select({ userId: emailChangeRequest.userId })
    .from(emailChangeRequest)
    .where(eq(emailChangeRequest.id, requestId))
    .limit(1);
  if (!owner) return null;

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
    .where(eq(user.id, owner.userId))
    .for("update");
  const [request] = await tx.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, requestId)).for("update");
  return account && request ? { account, request } : null;
}

function writesFor(tx: Tx, { account, request }: LockedRows, now: Date): FinalizationWrites {
  return {
    async expire() {
      await tx
        .update(emailChangeRequest)
        .set({ state: "expired", currentTokenHash: null, newTokenHash: null })
        .where(eq(emailChangeRequest.id, request.id));
    },
    async cancel(reason) {
      await markCancelledWith(tx, request.id, reason, now);
    },
    async isTakenByAnotherAccount(email) {
      const [taken] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.email, email), ne(user.id, account.id)))
        .limit(1);
      return taken !== undefined;
    },
    async commitNewAddress(email) {
      // One statement for the whitelisted account columns; the relative
      // increment never rewinds a concurrent generation.
      const bumped = await tx.execute<{ security_version: number }>(
        sql`UPDATE "user"
            SET email = ${email},
                email_verified = true,
                password_reset_invalid_before = ${now.toISOString()}::timestamp,
                updated_at = ${now.toISOString()}::timestamp,
                security_version = security_version + 1,
                session_revocation_pending = true
            WHERE id = ${account.id}
            RETURNING security_version`,
      );
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
        .where(eq(emailChangeRequest.id, request.id));
      await cancelPendingSetupsWith(tx, account.id, now);
      return Number(bumped.rows[0]?.security_version);
    },
  };
}

/**
 * Runs `decide` against the locked account and request rows (`null` when
 * either is gone) inside the finalization transaction. `conflict` means the
 * transaction rolled back because another account claimed the address
 * first: the unique email is the final arbiter of a race the availability
 * check could not see. Any other failure propagates.
 */
export async function finalizeEmailChange<T>(
  _ctx: PublicCtx,
  target: { requestId: string; now: Date },
  decide: (locked: LockedFinalization | null) => Promise<T>,
): Promise<Finalized<T>> {
  try {
    const result = await db.transaction(async (tx) => {
      const rows = await lockRows(tx, target.requestId);
      return decide(rows && { ...rows, writes: writesFor(tx, rows, target.now) });
    });
    return { conflict: false, result };
  } catch (error) {
    if (uniqueViolationConstraint(error) === USER_EMAIL_UNIQUE) return { conflict: true };
    throw error;
  }
}
