import "server-only";

import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";

import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";
import { db, emailChangeRequest } from "@/src/lib/db";
import { ACTIVE_STATES, type EmailChangeRequestRow, type EmailRequestCancelReason } from "./requests";

/**
 * State transitions of an `email_change_request` row. Each is one
 * conditional statement: the `WHERE` clause is the precondition the caller
 * asked for, so a lost race changes nothing and is reported as such. Every
 * terminal transition erases both proof digests in the same statement.
 */

export type RequestWriter = Pick<typeof db, "update">;

const erasedDigests = { currentTokenHash: null, newTokenHash: null } as const;

const isActive = inArray(emailChangeRequest.state, ACTIVE_STATES);

export async function markExpired(_ctx: AuthedCtx | PublicCtx, requestId: string): Promise<void> {
  await db
    .update(emailChangeRequest)
    .set({ state: "expired", ...erasedDigests })
    .where(and(eq(emailChangeRequest.id, requestId), isActive));
}

/** Expires the request only if its deadline has passed; `true` when this call did. */
export async function expireIfOverdue(_ctx: AuthedCtx | PublicCtx, requestId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(emailChangeRequest)
    .set({ state: "expired", ...erasedDigests })
    .where(and(eq(emailChangeRequest.id, requestId), isActive, lte(emailChangeRequest.expiresAt, now)))
    .returning({ id: emailChangeRequest.id });
  return rows.length > 0;
}

export async function markCancelledWith(
  executor: RequestWriter,
  requestId: string,
  reason: EmailRequestCancelReason,
  now: Date,
): Promise<boolean> {
  const rows = await executor
    .update(emailChangeRequest)
    .set({ state: "cancelled", cancelReason: reason, cancelledAt: now, ...erasedDigests })
    .where(and(eq(emailChangeRequest.id, requestId), isActive))
    .returning({ id: emailChangeRequest.id });
  return rows.length > 0;
}

export function markCancelled(
  _ctx: AuthedCtx | PublicCtx,
  requestId: string,
  reason: EmailRequestCancelReason,
  now: Date,
): Promise<boolean> {
  return markCancelledWith(db, requestId, reason, now);
}

/** The owner withdraws their own active request; `false` when there was nothing active to withdraw. */
export async function cancelOwnedRequest(ctx: AuthedCtx, requestId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(emailChangeRequest)
    .set({ state: "cancelled", cancelReason: "user", cancelledAt: now, ...erasedDigests })
    .where(and(eq(emailChangeRequest.id, requestId), eq(emailChangeRequest.userId, ctx.user.id), isActive))
    .returning({ id: emailChangeRequest.id });
  return rows.length > 0;
}

/** Cancels every active request of a user (of one `kind` when given). */
export async function cancelActiveRequestsWhere(
  executor: RequestWriter,
  userId: string,
  reason: EmailRequestCancelReason,
  kind?: EmailChangeRequestRow["kind"],
): Promise<number> {
  const rows = await executor
    .update(emailChangeRequest)
    .set({ state: "cancelled", cancelReason: reason, cancelledAt: new Date(), ...erasedDigests })
    .where(
      and(eq(emailChangeRequest.userId, userId), isActive, kind ? eq(emailChangeRequest.kind, kind) : undefined),
    )
    .returning({ id: emailChangeRequest.id });
  return rows.length;
}

/**
 * The destination of a change, chosen once: address, its proof digest and
 * the stage advance in one statement, for the owner's unexpired request
 * that is still awaiting an address. `null` when no such row remained.
 */
export async function selectNewAddress(
  ctx: AuthedCtx,
  selection: { requestId: string; newEmail: string; newTokenHash: string; now: Date },
): Promise<EmailChangeRequestRow | null> {
  const [row] = await db
    .update(emailChangeRequest)
    .set({
      state: "awaiting_new",
      newEmail: selection.newEmail,
      newTokenHash: selection.newTokenHash,
      newTokenGeneration: sql`${emailChangeRequest.newTokenGeneration} + 1`,
    })
    .where(
      and(
        eq(emailChangeRequest.id, selection.requestId),
        eq(emailChangeRequest.userId, ctx.user.id),
        eq(emailChangeRequest.state, "awaiting_new_address"),
        gt(emailChangeRequest.expiresAt, selection.now),
      ),
    )
    .returning();
  return row ?? null;
}

export type TokenRotation = {
  requestId: string;
  purpose: "current" | "new";
  /** The stage and token generation the caller observed; either moving on loses the rotation. */
  observedState: EmailChangeRequestRow["state"];
  observedGeneration: number;
  tokenHash: string;
  now: Date;
};

/**
 * Replaces a stage's proof digest, superseding the link sent before it. The
 * deadline is never written. `null` when the request moved on, expired or
 * was rotated by someone else since the caller read it.
 */
export async function rotateToken(ctx: AuthedCtx, rotation: TokenRotation): Promise<EmailChangeRequestRow | null> {
  const columns =
    rotation.purpose === "current"
      ? { hash: emailChangeRequest.currentTokenHash, generation: emailChangeRequest.currentTokenGeneration }
      : { hash: emailChangeRequest.newTokenHash, generation: emailChangeRequest.newTokenGeneration };
  const rotated =
    rotation.purpose === "current"
      ? { currentTokenHash: rotation.tokenHash, currentTokenGeneration: sql`${columns.generation} + 1` }
      : { newTokenHash: rotation.tokenHash, newTokenGeneration: sql`${columns.generation} + 1` };

  const [row] = await db
    .update(emailChangeRequest)
    .set(rotated)
    .where(
      and(
        eq(emailChangeRequest.id, rotation.requestId),
        eq(emailChangeRequest.userId, ctx.user.id),
        eq(emailChangeRequest.state, rotation.observedState),
        eq(columns.generation, rotation.observedGeneration),
        gt(emailChangeRequest.expiresAt, rotation.now),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * The current mailbox agreed: the proof is consumed and the request moves
 * on to choosing the new address, once. `false` when the digest, the stage
 * or the deadline no longer match.
 */
export async function confirmCurrentAddress(
  _ctx: PublicCtx,
  proof: { requestId: string; tokenHash: string; now: Date },
): Promise<boolean> {
  const rows = await db
    .update(emailChangeRequest)
    .set({ state: "awaiting_new_address", currentConfirmedAt: proof.now, currentTokenHash: null })
    .where(
      and(
        eq(emailChangeRequest.id, proof.requestId),
        eq(emailChangeRequest.state, "awaiting_current"),
        eq(emailChangeRequest.currentTokenHash, proof.tokenHash),
        gt(emailChangeRequest.expiresAt, proof.now),
      ),
    )
    .returning({ id: emailChangeRequest.id });
  return rows.length > 0;
}
