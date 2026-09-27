import "server-only";

import { auth } from "./index";

/**
 * The narrow seam between guarded account operations and the provider's
 * session store. Better Auth performs its own cache refreshes and session
 * deletions through hooks whose failures are logged, not propagated, so a
 * successful provider response is not proof that Redis agrees. These two
 * functions perform the effects directly and observe the result; they are
 * called only after an operation's policy checks have passed.
 *
 * Provider-version coupling is contained here: the functions use the
 * installed internal adapter's own methods (`refreshUserSessions`,
 * `listSessions`, `deleteSessions`, `deleteUserSessions`, `findSessions`)
 * and never rebuild Redis key names. Session tokens never leave the server:
 * the owned-session listing below carries them only so the settings service
 * can map a public session ID to the token it revokes, and that service
 * projects them away before anything is returned.
 */

async function internalAdapter() {
  return (await auth.$context).internalAdapter;
}

/**
 * After a committed user-row change: every active session's cached copy of
 * the user is replaced with the committed row, so the change is visible on
 * the next request rather than at the next sign-in. Throws when the
 * provider's refresh fails; callers report that as a partial outcome.
 */
export async function refreshCommittedUserSessions(userId: string): Promise<void> {
  const adapter = await internalAdapter();
  const committed = await adapter.findUserById(userId);
  if (!committed) throw new Error(`User ${userId} no longer exists; nothing to refresh.`);
  await adapter.refreshUserSessions(committed);
}

export type RevocationResult = {
  /** Sessions that existed at execution and were removed. */
  revoked: number;
};

/**
 * Removes every session the user has at execution time: capture them, delete
 * them directly (a Redis failure propagates), run the provider's ordinary
 * cleanup for its bookkeeping, then verify none of the captured sessions is
 * still readable. Idempotent when there are none. A fresh sign-in afterwards
 * is allowed; a ban's own policy is what prevents that.
 */
export async function revokeCurrentUserSessions(userId: string): Promise<RevocationResult> {
  const adapter = await internalAdapter();
  const active = await adapter.listSessions(userId, { onlyActiveSessions: true });
  const tokens = active.map((session) => session.token);

  if (tokens.length > 0) await adapter.deleteSessions(tokens);
  await adapter.deleteUserSessions(userId);

  if (tokens.length > 0) {
    const remaining = await adapter.findSessions(tokens);
    if (remaining.length > 0) {
      throw new Error(
        `${remaining.length} of ${tokens.length} sessions for user ${userId} are still valid after revocation.`,
      );
    }
  }

  return { revoked: tokens.length };
}

/** One of the user's own active sessions, as the store holds it. Never serialized as-is. */
export type OwnedSession = {
  id: string;
  /** Server-side only: the revocation handle. */
  token: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

function toInstant(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(typeof value === "string" || typeof value === "number" ? value : NaN);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

/** The user's active sessions at execution time; other users are never enumerated. */
export async function listActiveUserSessions(userId: string): Promise<OwnedSession[]> {
  const adapter = await internalAdapter();
  const active = await adapter.listSessions(userId, { onlyActiveSessions: true });
  const now = Date.now();
  return active
    .filter((session) => session.userId === userId)
    .map((session) => ({
      id: session.id,
      token: session.token,
      createdAt: toInstant(session.createdAt),
      expiresAt: toInstant(session.expiresAt),
      ipAddress: session.ipAddress || null,
      userAgent: session.userAgent || null,
    }))
    .filter((session) => session.expiresAt.getTime() > now);
}

/**
 * Removes exactly the given sessions (already resolved from owned rows by
 * the caller) and verifies none of them is still readable. Idempotent for
 * tokens that are already gone.
 */
export async function revokeSessionsByToken(tokens: readonly string[]): Promise<RevocationResult> {
  if (tokens.length === 0) return { revoked: 0 };
  const adapter = await internalAdapter();
  await adapter.deleteSessions([...tokens]);
  const remaining = await adapter.findSessions([...tokens]);
  if (remaining.length > 0) {
    throw new Error(`${remaining.length} of ${tokens.length} sessions are still valid after revocation.`);
  }
  return { revoked: tokens.length };
}
