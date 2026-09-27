import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";
import { securityVersionOf, type SqlReader } from "@/src/lib/auth/securityVersion";
import { authenticatorSetupRequest, db, twoFactor } from "@/src/lib/db";
import { claimOnce, consumeBudget, reserveAttempt } from "@/src/lib/throttle";
import { AUTHENTICATOR_SETUP_POLICY } from "@/app/(AuthModule)/_/db/settings/shared/policy";
import { rateLimitedError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { isUuid } from "@/app/(AuthModule)/_/db/settings/shared/ids";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/db/settings/shared/throttleKeys";
import { invalidCodeError, setupExpiredError, setupReplacedError } from "./errors";

/**
 * The app-owned `authenticator_setup_request`: at most one pending attempt
 * per account, bound to the session and security generation that started
 * it, with its own initiation and wrong-code budgets.
 */

export type SetupRequestRow = typeof authenticatorSetupRequest.$inferSelect;
type SetupWriter = Pick<typeof db, "update" | "delete">;

/**
 * Retires the user's pending setup attempt. An enrollment's still-unverified
 * provider row goes with it; a verified factor is never touched here.
 */
export async function cancelPendingSetupRequests(
  _ctx: AuthedCtx | PublicCtx,
  tx: SetupWriter,
  userId: string,
): Promise<number> {
  const rows = await tx
    .update(authenticatorSetupRequest)
    .set({ state: "cancelled", cancelledAt: new Date(), replacementSecret: null })
    .where(and(eq(authenticatorSetupRequest.userId, userId), eq(authenticatorSetupRequest.state, "pending")))
    .returning({ kind: authenticatorSetupRequest.kind, currentFactorId: authenticatorSetupRequest.currentFactorId });
  for (const row of rows.filter((cancelled) => cancelled.kind === "enroll")) {
    await tx
      .delete(twoFactor)
      .where(and(eq(twoFactor.id, row.currentFactorId), eq(twoFactor.userId, userId), eq(twoFactor.verified, false)));
  }
  // TODO(audit): Persist settings.factor_setup.cancelled per row (kind, UTC time).
  return rows.length;
}

/** Charges one setup start against the account's hourly allowance. */
export async function consumeSetupInitiation(ctx: AuthedCtx): Promise<void> {
  const { limit, windowSeconds } = AUTHENTICATOR_SETUP_POLICY.initiations;
  const budget = await consumeBudget(settingsThrottleKeys.setupInitiations(ctx.user.id), limit, windowSeconds);
  if (!budget.allowed) {
    throw rateLimitedError(budget.retryAfterSeconds, "Too many authenticator setups started. Try again later.");
  }
}

type NewSetup = Pick<
  SetupRequestRow,
  "kind" | "currentFactorId" | "currentFactorFingerprint" | "authorizedSecurityVersion" | "replacementSecret"
>;

/** Replaces any pending attempt with this one, in one transaction. */
export async function insertSetup(ctx: AuthedCtx, values: NewSetup): Promise<SetupRequestRow> {
  const now = new Date();
  return db.transaction(async (tx) => {
    await cancelPendingSetupRequests(ctx, tx, ctx.user.id);
    const [row] = await tx
      .insert(authenticatorSetupRequest)
      .values({
        id: randomUUID(),
        userId: ctx.user.id,
        initiatingSessionId: ctx.session.id,
        state: "pending",
        createdAt: now,
        expiresAt: new Date(now.getTime() + AUTHENTICATOR_SETUP_POLICY.setupTtlMs),
        ...values,
      })
      .returning();
    // TODO(audit): Persist settings.factor_setup.started (request ID, kind,
    // actor user ID, UTC time). Never the secret, URI or fingerprint source.
    return row;
  });
}

/** The owner's pending attempt of `kind`, bound to the initiating session and generation; an overdue one expires. */
export async function requireOwnedSetup(
  ctx: AuthedCtx,
  reads: SqlReader,
  requestId: string,
  kind: SetupRequestRow["kind"],
  now: Date,
): Promise<SetupRequestRow> {
  if (!isUuid(requestId)) throw setupReplacedError();
  const [row] = await reads
    .select()
    .from(authenticatorSetupRequest)
    .where(and(eq(authenticatorSetupRequest.id, requestId), eq(authenticatorSetupRequest.userId, ctx.user.id)))
    .limit(1);
  if (!row || row.state !== "pending" || row.kind !== kind) throw setupReplacedError();
  if (now.getTime() >= row.expiresAt.getTime()) {
    await db
      .update(authenticatorSetupRequest)
      .set({ state: "expired", replacementSecret: null })
      .where(and(eq(authenticatorSetupRequest.id, row.id), eq(authenticatorSetupRequest.state, "pending")));
    throw setupExpiredError();
  }
  if (row.initiatingSessionId !== ctx.session.id) throw setupReplacedError();
  if (row.authorizedSecurityVersion !== securityVersionOf(ctx.user)) throw setupReplacedError();
  return row;
}

export async function markSetupCompleted(requestId: string, now: Date): Promise<void> {
  await db
    .update(authenticatorSetupRequest)
    .set({ state: "completed", completedAt: now })
    .where(eq(authenticatorSetupRequest.id, requestId));
}

/** Charges one code attempt against the attempt's own budget, before the code is checked. */
export async function reserveCodeAttempt(requestId: string): Promise<void> {
  const { limit, windowSeconds } = AUTHENTICATOR_SETUP_POLICY.codeAttempts;
  const decision = await reserveAttempt(settingsThrottleKeys.setupCodeAttempts(requestId), limit, windowSeconds);
  if (!decision.allowed) {
    throw rateLimitedError(decision.retryAfterSeconds, "Too many incorrect codes. Start the setup again later.");
  }
}

/** A correct code completes an attempt once; the same code submitted again is refused as invalid. */
export async function spendCode(requestId: string, code: string): Promise<void> {
  const key = settingsThrottleKeys.spentSetupCode(requestId, code);
  if (!(await claimOnce(key, AUTHENTICATOR_SETUP_POLICY.spentCodeSeconds))) throw invalidCodeError();
}
