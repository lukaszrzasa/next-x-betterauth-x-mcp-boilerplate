import "server-only";

import { Pool, type PoolClient } from "pg";

import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";

/**
 * Coordination for the security-state protocol of one account, and nothing
 * else: a PostgreSQL transaction-level advisory lock, held while an
 * operation checks the account's security generation, retires its pending
 * requests and lets the provider write a credential, factor, address or ban
 * on its own connection. Those steps commit separately, so no transaction
 * can cover them; the lock is what keeps a second security change out of
 * the gap between them. Every call site names the race it excludes.
 *
 * Ordinary edits (names, session revocation, effect retries) and the
 * request transitions that one conditional statement decides do not take
 * it. It is not a rollback boundary: the lock transaction writes nothing,
 * and whatever committed while it was held stays committed.
 *
 * Bans first take the global admin-ban lock, so two simultaneous bans cannot
 * both pass the last-admin count. Every ban uses the same order (global,
 * then target); everything else takes the target lock alone.
 *
 * Lock holders use a small pool of their own: with the application pool a
 * burst of waiting holders could exhaust the connections the provider write
 * itself needs to finish, deadlocking on the pool rather than on the lock.
 */

/** Distinct from the setup lock's namespace (194731). */
const LOCK_NAMESPACE = 194732;
const ADMIN_BAN_LOCK_KEY = 1;

const LOCK_TIMEOUT_MS = 5_000;
const CONNECTION_TIMEOUT_MS = 5_000;
const MAX_LOCK_CONNECTIONS = 2;

/** PostgreSQL: lock not available (lock_timeout). */
const LOCK_NOT_AVAILABLE = "55P03";

const globalForLockPool = globalThis as typeof globalThis & { accountSecurityLockPool?: Pool };

function lockPool(): Pool {
  if (!globalForLockPool.accountSecurityLockPool) {
    globalForLockPool.accountSecurityLockPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: MAX_LOCK_CONNECTIONS,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    });
  }
  return globalForLockPool.accountSecurityLockPool;
}

/** Contention: the caller may retry, nothing was written. */
function accountBusyError(cause: unknown): ActionError {
  return new ActionError("CONFLICT", {
    message: "Another change to this account is still in progress. Try again in a moment.",
    data: { retryable: true },
    cause,
  });
}

async function connectForLock(): Promise<PoolClient> {
  try {
    return await lockPool().connect();
  } catch (error) {
    throw accountBusyError(error);
  }
}

async function acquire(client: PoolClient, userId: string, adminBan: boolean): Promise<void> {
  try {
    await client.query(`SET LOCAL lock_timeout = ${LOCK_TIMEOUT_MS}`);
    if (adminBan) {
      await client.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [LOCK_NAMESPACE, ADMIN_BAN_LOCK_KEY]);
    }
    await client.query("SELECT pg_advisory_xact_lock($1::int, hashtext($2))", [LOCK_NAMESPACE, userId]);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    throw code === LOCK_NOT_AVAILABLE ? accountBusyError(error) : error;
  }
}

/**
 * Runs `work` while holding the account's security lock. Released on every
 * outcome, after `work` settles; never resolve a lock through a racing
 * timeout while a provider write may still be running.
 *
 * The lock performs no actor authorization: it accepts a public context for
 * the emailed-link proofs and the password reset, whose caller has already
 * established token authority for `userId`. It is never fabricated for them.
 */
export async function withAccountSecurityLock<T>(
  _ctx: AuthedCtx | PublicCtx,
  userId: string,
  work: () => Promise<T>,
  options: { adminBan?: boolean } = {},
): Promise<T> {
  const client = await connectForLock();
  let began = false;
  try {
    await client.query("BEGIN");
    began = true;
    await acquire(client, userId, options.adminBan === true);
    return await work();
  } finally {
    if (began) {
      // The transaction wrote nothing; ending it is what releases the lock.
      await client.query("ROLLBACK").catch(() => undefined);
    }
    client.release();
  }
}

/** For tests and graceful shutdown; the pool is otherwise reused for the process. */
export async function closeAccountSecurityLockPool(): Promise<void> {
  const pool = globalForLockPool.accountSecurityLockPool;
  globalForLockPool.accountSecurityLockPool = undefined;
  await pool?.end();
}
