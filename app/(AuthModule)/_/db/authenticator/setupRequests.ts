import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { authenticatorSetupRequest, db, twoFactor } from "@/src/lib/db";

/**
 * The app-owned `authenticator_setup_request`: at most one pending attempt
 * per account, bound to the session and security generation that started
 * it.
 */

export type SetupRequestRow = typeof authenticatorSetupRequest.$inferSelect;
type SetupWriter = Pick<typeof db, "update" | "delete">;

type Cancelled = Pick<SetupRequestRow, "kind" | "currentFactorId">;

/** An enrollment's still-unverified provider row goes with its attempt; a verified factor is never touched. */
async function deleteUnverifiedFactorsOf(tx: SetupWriter, userId: string, cancelled: Cancelled[]): Promise<void> {
  for (const row of cancelled.filter((setup) => setup.kind === "enroll")) {
    await tx
      .delete(twoFactor)
      .where(and(eq(twoFactor.id, row.currentFactorId), eq(twoFactor.userId, userId), eq(twoFactor.verified, false)));
  }
}

/** Retires the user's pending attempt in the caller's transaction; returns how many rows that was. */
export async function cancelPendingSetupsWith(tx: SetupWriter, userId: string, now: Date): Promise<number> {
  const rows = await tx
    .update(authenticatorSetupRequest)
    .set({ state: "cancelled", cancelledAt: now, replacementSecret: null })
    .where(and(eq(authenticatorSetupRequest.userId, userId), eq(authenticatorSetupRequest.state, "pending")))
    .returning({ kind: authenticatorSetupRequest.kind, currentFactorId: authenticatorSetupRequest.currentFactorId });
  await deleteUnverifiedFactorsOf(tx, userId, rows);
  return rows.length;
}

/** Retires the actor's pending attempt, whichever it is, with its unverified enrollment row. */
export function cancelPendingSetups(ctx: AuthedCtx, now: Date): Promise<number> {
  return db.transaction((tx) => cancelPendingSetupsWith(tx, ctx.user.id, now));
}

/**
 * Retires exactly the requested attempt, if it is the actor's and still
 * pending, together with that attempt's unverified enrollment row. A newer
 * attempt of the same account is not this one and stays as it is.
 */
export async function cancelSetupRequest(ctx: AuthedCtx, requestId: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(authenticatorSetupRequest)
      .set({ state: "cancelled", cancelledAt: now, replacementSecret: null })
      .where(
        and(
          eq(authenticatorSetupRequest.id, requestId),
          eq(authenticatorSetupRequest.userId, ctx.user.id),
          eq(authenticatorSetupRequest.state, "pending"),
        ),
      )
      .returning({ kind: authenticatorSetupRequest.kind, currentFactorId: authenticatorSetupRequest.currentFactorId });
    await deleteUnverifiedFactorsOf(tx, ctx.user.id, rows);
    return rows.length > 0;
  });
}

export type NewSetup = Pick<
  SetupRequestRow,
  | "kind"
  | "currentFactorId"
  | "currentFactorFingerprint"
  | "authorizedSecurityVersion"
  | "replacementSecret"
  | "createdAt"
  | "expiresAt"
>;

/** Replaces any pending attempt with this one, in one transaction. */
export async function insertSetup(ctx: AuthedCtx, values: NewSetup): Promise<SetupRequestRow> {
  return db.transaction(async (tx) => {
    await cancelPendingSetupsWith(tx, ctx.user.id, values.createdAt);
    const [row] = await tx
      .insert(authenticatorSetupRequest)
      .values({
        id: randomUUID(),
        userId: ctx.user.id,
        initiatingSessionId: ctx.session.id,
        state: "pending",
        ...values,
      })
      .returning();
    return row;
  });
}

/** A setup attempt by ID among the actor's own; another account's row matches nothing. */
export async function findOwnedSetup(ctx: AuthedCtx, requestId: string): Promise<SetupRequestRow | null> {
  const [row] = await db
    .select()
    .from(authenticatorSetupRequest)
    .where(and(eq(authenticatorSetupRequest.id, requestId), eq(authenticatorSetupRequest.userId, ctx.user.id)))
    .limit(1);
  return row ?? null;
}

export async function markSetupExpired(_ctx: AuthedCtx, requestId: string): Promise<void> {
  await db
    .update(authenticatorSetupRequest)
    .set({ state: "expired", replacementSecret: null })
    .where(and(eq(authenticatorSetupRequest.id, requestId), eq(authenticatorSetupRequest.state, "pending")));
}

export async function markSetupCompleted(_ctx: AuthedCtx, requestId: string, now: Date): Promise<void> {
  await db
    .update(authenticatorSetupRequest)
    .set({ state: "completed", completedAt: now })
    .where(eq(authenticatorSetupRequest.id, requestId));
}
