import "server-only";

import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { db, user } from "@/src/lib/db";
import type * as schema from "@/src/lib/db/schema";
import { ActionError } from "./errors";

/**
 * The account's security generation (`user.securityVersion`). Every
 * credential, factor, recovery-code and sign-in email change moves it on;
 * a step-up grant records the generation it was issued for and is refused
 * once the account has moved past it, without signing any device out. The
 * durable version is the correctness guarantee; deleting Redis grants is
 * only cleanup.
 */

/** A Drizzle handle that can run raw statements: the database or a transaction. */
export type SqlExecutor = Pick<NodePgDatabase<typeof schema>, "execute">;
/** A Drizzle handle that can read: the database or a transaction. */
export type SqlReader = Pick<NodePgDatabase<typeof schema>, "select">;

/** `ActionError.data` of a `CONFLICT` raised because the account's security state moved on. */
export type SecurityStateChangedData = { code: "SECURITY_STATE_CHANGED"; retryable: true };

export function securityStateChangedError(cause?: unknown): ActionError {
  const data: SecurityStateChangedData = { code: "SECURITY_STATE_CHANGED", retryable: true };
  return new ActionError("CONFLICT", {
    message:
      "Your account's security settings changed while this request was in progress. Verify again and retry.",
    data,
    cause,
  });
}

/** The version a session user carries; the authority read always sets it. */
export function securityVersionOf(user: { securityVersion?: number | null }): number {
  return typeof user.securityVersion === "number" ? user.securityVersion : 0;
}

/** The current durable version, or `null` when the account no longer exists. */
export async function readSecurityVersion(
  userId: string,
  reads: SqlReader = db,
): Promise<number | null> {
  const [row] = await reads
    .select({ securityVersion: user.securityVersion })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ? row.securityVersion : null;
}

/**
 * Refuses an actor context whose proofs were established for an older
 * generation. Called under the account security lock, after waiting for it,
 * so a queued operation cannot spend authorization that an earlier one
 * superseded.
 */
export async function assertSecurityStateCurrent(
  userId: string,
  expected: number,
  reads: SqlReader = db,
): Promise<number> {
  const current = await readSecurityVersion(userId, reads);
  if (current === null) {
    throw new ActionError("NOT_FOUND", { message: "This account no longer exists." });
  }
  if (current !== expected) throw securityStateChangedError();
  return current;
}

/**
 * Moves the account to its next generation. Runs inside the caller's write
 * transaction for app-owned changes, or immediately before a provider-owned
 * write: an increment stays effective even if that later write fails, which
 * costs the user another verification but never leaves a stale grant alive.
 * Only this column changes.
 */
export async function incrementSecurityVersion(
  userId: string,
  executor: SqlExecutor = db,
): Promise<number> {
  const result = await executor.execute<{ security_version: number }>(
    sql`UPDATE "user" SET security_version = security_version + 1 WHERE id = ${userId} RETURNING security_version`,
  );
  const row = result.rows[0];
  if (!row) throw new ActionError("NOT_FOUND", { message: "This account no longer exists." });
  return Number(row.security_version);
}
