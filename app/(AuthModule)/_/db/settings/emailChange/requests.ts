import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import type { SqlReader } from "@/src/lib/auth/securityVersion";
import { ACTIVE_EMAIL_CHANGE_STATES, db, emailChangeRequest, type EmailChangeCancelReason } from "@/src/lib/db";
import { EMAIL_CHANGE_POLICY } from "@/app/(AuthModule)/_/db/settings/shared/policy";
import { isUuid } from "@/app/(AuthModule)/_/db/settings/shared/ids";
import { expiredRequestError, inactiveRequestError } from "./errors";

/**
 * The `email_change_request` row and its state transitions. Every terminal
 * transition erases both proof digests in the same statement, and every
 * update is conditioned on the state it expects, so a lost race changes
 * nothing.
 */

export type EmailChangeRequestRow = typeof emailChangeRequest.$inferSelect;
export type RequestWriter = Pick<typeof db, "update">;

export const ACTIVE_STATES = [...ACTIVE_EMAIL_CHANGE_STATES];

export const isActive = (row: EmailChangeRequestRow): boolean => (ACTIVE_STATES as string[]).includes(row.state);
export const isExpired = (row: EmailChangeRequestRow, now: Date): boolean =>
  now.getTime() >= row.expiresAt.getTime();

/** Erases every proof digest together with the terminal state. */
const erasedDigests = { currentTokenHash: null, newTokenHash: null } as const;

export async function findActiveRequest(reads: SqlReader, userId: string): Promise<EmailChangeRequestRow | null> {
  const [row] = await reads
    .select()
    .from(emailChangeRequest)
    .where(and(eq(emailChangeRequest.userId, userId), inArray(emailChangeRequest.state, ACTIVE_STATES)))
    .limit(1);
  return row ?? null;
}

export async function markExpired(executor: RequestWriter, requestId: string): Promise<void> {
  await executor
    .update(emailChangeRequest)
    .set({ state: "expired", ...erasedDigests })
    .where(and(eq(emailChangeRequest.id, requestId), inArray(emailChangeRequest.state, ACTIVE_STATES)));
}

export async function markCancelled(
  executor: RequestWriter,
  requestId: string,
  reason: EmailChangeCancelReason,
  now: Date,
): Promise<boolean> {
  const rows = await executor
    .update(emailChangeRequest)
    .set({ state: "cancelled", cancelReason: reason, cancelledAt: now, ...erasedDigests })
    .where(and(eq(emailChangeRequest.id, requestId), inArray(emailChangeRequest.state, ACTIVE_STATES)))
    .returning({ id: emailChangeRequest.id });
  return rows.length > 0;
}

/** Cancels every active request of a user (of one `kind` when given), in the caller's transaction. */
export async function cancelActiveRequestsWhere(
  executor: RequestWriter,
  userId: string,
  reason: EmailChangeCancelReason,
  kind?: EmailChangeRequestRow["kind"],
): Promise<number> {
  const rows = await executor
    .update(emailChangeRequest)
    .set({ state: "cancelled", cancelReason: reason, cancelledAt: new Date(), ...erasedDigests })
    .where(
      and(
        eq(emailChangeRequest.userId, userId),
        inArray(emailChangeRequest.state, ACTIVE_STATES),
        kind ? eq(emailChangeRequest.kind, kind) : undefined,
      ),
    )
    .returning({ id: emailChangeRequest.id });
  return rows.length;
}

/** The owner's active request by ID, or the closed lifecycle refusal; an overdue one is marked expired. */
export async function requireOwnedRequest(
  reads: SqlReader,
  userId: string,
  requestId: string,
  now: Date,
): Promise<EmailChangeRequestRow> {
  if (!isUuid(requestId)) throw inactiveRequestError();
  const [row] = await reads
    .select()
    .from(emailChangeRequest)
    .where(and(eq(emailChangeRequest.id, requestId), eq(emailChangeRequest.userId, userId)))
    .limit(1);
  if (!row || !isActive(row)) throw inactiveRequestError();
  if (isExpired(row, now)) {
    await markExpired(db, row.id);
    throw expiredRequestError();
  }
  return row;
}

type NewRequest = Pick<
  EmailChangeRequestRow,
  "kind" | "state" | "originalEmail" | "newEmail" | "currentTokenHash" | "newTokenHash"
>;

/**
 * Replaces whatever request is active (expired rows marked, live ones
 * cancelled as replaced) and inserts exactly one new request, in one write
 * transaction. The partial unique index is the final arbiter against a
 * concurrent start that slipped past the lock.
 */
export async function createRequest(ctx: AuthedCtx, values: NewRequest): Promise<EmailChangeRequestRow> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const active = await findActiveRequest(tx, ctx.user.id);
    if (active && isExpired(active, now)) await markExpired(tx, active.id);
    else if (active) await markCancelled(tx, active.id, "replaced", now);

    const [row] = await tx
      .insert(emailChangeRequest)
      .values({
        id: randomUUID(),
        userId: ctx.user.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + EMAIL_CHANGE_POLICY.requestTtlMs),
        initiatingSessionId: ctx.session.id,
        currentTokenGeneration: values.currentTokenHash ? 1 : 0,
        newTokenGeneration: values.newTokenHash ? 1 : 0,
        ...values,
      })
      .returning();
    return row;
  });
}
