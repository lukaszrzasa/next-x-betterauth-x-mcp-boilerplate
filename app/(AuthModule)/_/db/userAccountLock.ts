import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";
import { schema } from "@/src/lib/db";

/**
 * Serializes short administrative actions on one account with a PostgreSQL
 * transaction-level advisory lock. The transaction holds the lock and serves
 * the policy reads (target row, installation record, admin count); it writes
 * nothing. The provider's own write commits on its usual connection while
 * the lock is held, so two operations on the same account cannot interleave
 * their read-check-write sequences - but this is not a rollback boundary
 * around the provider call, and no cross-store atomicity is implied.
 *
 * Bans first take a global admin-ban lock, so two simultaneous bans cannot
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
const STATEMENT_TIMEOUT_MS = 5_000;
const CONNECTION_TIMEOUT_MS = 5_000;
const MAX_LOCK_CONNECTIONS = 2;

/** PostgreSQL: lock not available (lock_timeout) and query cancelled (statement_timeout). */
const LOCK_NOT_AVAILABLE = "55P03";
const QUERY_CANCELED = "57014";

const globalForLockPool = globalThis as typeof globalThis & { userAccountLockPool?: Pool };

function lockPool(): Pool {
  if (!globalForLockPool.userAccountLockPool) {
    globalForLockPool.userAccountLockPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: MAX_LOCK_CONNECTIONS,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    });
  }
  return globalForLockPool.userAccountLockPool;
}

export type LockedReads = NodePgDatabase<typeof schema>;

/** Contention or a slow policy read: the caller may retry, nothing was written. */
export function accountBusyError(cause: unknown): ActionError {
  return new ActionError("CONFLICT", {
    message: "Another change to this account is still in progress. Try again in a moment.",
    data: { retryable: true },
    cause,
  });
}

function isTimeout(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === LOCK_NOT_AVAILABLE || code === QUERY_CANCELED;
}

async function connectForLock(): Promise<PoolClient> {
  try {
    return await lockPool().connect();
  } catch (error) {
    throw accountBusyError(error);
  }
}

/**
 * Runs `work` while holding the account's lock. `reads` is a Drizzle handle
 * bound to the lock transaction for policy reads only. Released on every
 * outcome, after `work` settles; never resolve a lock through a racing
 * timeout while a provider write may still be running.
 *
 * The lock performs no actor authorization: it accepts a public context for
 * the emailed-link proofs of the settings flows, whose caller has already
 * established token authority for `userId`. It is never fabricated for them.
 */
export async function withUserAccountLock<T>(
  _ctx: AuthedCtx | PublicCtx,
  userId: string,
  work: (reads: LockedReads) => Promise<T>,
  options: { adminBan?: boolean } = {},
): Promise<T> {
  const client = await connectForLock();
  let began = false;
  try {
    await client.query("BEGIN");
    began = true;
    await client.query(`SET LOCAL lock_timeout = ${LOCK_TIMEOUT_MS}`);
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    try {
      if (options.adminBan) {
        await client.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [
          LOCK_NAMESPACE,
          ADMIN_BAN_LOCK_KEY,
        ]);
      }
      await client.query("SELECT pg_advisory_xact_lock($1::int, hashtext($2))", [
        LOCK_NAMESPACE,
        userId,
      ]);
    } catch (error) {
      throw isTimeout(error) ? accountBusyError(error) : error;
    }

    const reads = drizzle(client, { schema });
    try {
      return await work(reads);
    } catch (error) {
      throw isTimeout(error) ? accountBusyError(error) : error;
    }
  } finally {
    if (began) {
      // The transaction wrote nothing; ending it is what releases the lock.
      await client.query("ROLLBACK").catch(() => undefined);
    }
    client.release();
  }
}

/** For tests and graceful shutdown; the pool is otherwise reused for the process. */
export async function closeUserAccountLockPool(): Promise<void> {
  const pool = globalForLockPool.userAccountLockPool;
  globalForLockPool.userAccountLockPool = undefined;
  await pool?.end();
}

/** Exposed so tests can assert the fixed acquisition order. */
export const USER_ACCOUNT_LOCK = { namespace: LOCK_NAMESPACE, adminBanKey: ADMIN_BAN_LOCK_KEY } as const;
