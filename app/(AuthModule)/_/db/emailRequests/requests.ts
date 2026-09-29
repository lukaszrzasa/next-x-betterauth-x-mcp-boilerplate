import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, lte, or } from "drizzle-orm";

import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";
import { ACTIVE_EMAIL_CHANGE_STATES, db, emailChangeRequest, type EmailChangeCancelReason } from "@/src/lib/db";

/**
 * The `email_change_request` row: its reads, and the insert that replaces
 * whatever request was active. The transitions of an existing row are in
 * `transitions.ts`.
 */

export type EmailChangeRequestRow = typeof emailChangeRequest.$inferSelect;
export type EmailRequestCancelReason = EmailChangeCancelReason;

export const ACTIVE_STATES = [...ACTIVE_EMAIL_CHANGE_STATES];

/** The actor's own active request, at whatever stage. */
export async function findActiveRequest(ctx: AuthedCtx): Promise<EmailChangeRequestRow | null> {
  const [row] = await db
    .select()
    .from(emailChangeRequest)
    .where(and(eq(emailChangeRequest.userId, ctx.user.id), inArray(emailChangeRequest.state, ACTIVE_STATES)))
    .limit(1);
  return row ?? null;
}

/** A request by ID among the actor's own; another account's row matches nothing. */
export async function findOwnedRequest(ctx: AuthedCtx, requestId: string): Promise<EmailChangeRequestRow | null> {
  const [row] = await db
    .select()
    .from(emailChangeRequest)
    .where(and(eq(emailChangeRequest.id, requestId), eq(emailChangeRequest.userId, ctx.user.id)))
    .limit(1);
  return row ?? null;
}

/** The request holding `hash` as one of its two proof digests. */
export async function findRequestByTokenHash(_ctx: PublicCtx, hash: string): Promise<EmailChangeRequestRow | null> {
  const [row] = await db
    .select()
    .from(emailChangeRequest)
    .where(or(eq(emailChangeRequest.currentTokenHash, hash), eq(emailChangeRequest.newTokenHash, hash)))
    .limit(1);
  return row ?? null;
}

export type NewEmailRequest = Pick<
  EmailChangeRequestRow,
  "kind" | "state" | "originalEmail" | "newEmail" | "currentTokenHash" | "newTokenHash" | "createdAt" | "expiresAt"
>;

/**
 * One transaction: the actor's active request leaves the active states
 * (overdue rows as expired, live ones as replaced) and exactly one new
 * request is inserted, so the partial unique index never sees two.
 */
export async function replaceActiveRequest(ctx: AuthedCtx, values: NewEmailRequest): Promise<EmailChangeRequestRow> {
  const active = and(eq(emailChangeRequest.userId, ctx.user.id), inArray(emailChangeRequest.state, ACTIVE_STATES));
  const erasedDigests = { currentTokenHash: null, newTokenHash: null };

  return db.transaction(async (tx) => {
    await tx
      .update(emailChangeRequest)
      .set({ state: "expired", ...erasedDigests })
      .where(and(active, lte(emailChangeRequest.expiresAt, values.createdAt)));
    await tx
      .update(emailChangeRequest)
      .set({ state: "cancelled", cancelReason: "replaced", cancelledAt: values.createdAt, ...erasedDigests })
      .where(active);

    const [row] = await tx
      .insert(emailChangeRequest)
      .values({
        id: randomUUID(),
        userId: ctx.user.id,
        initiatingSessionId: ctx.session.id,
        currentTokenGeneration: values.currentTokenHash ? 1 : 0,
        newTokenGeneration: values.newTokenHash ? 1 : 0,
        ...values,
      })
      .returning();
    return row;
  });
}
