import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db, emailChangeRequest, user } from "@/src/lib/db";
import { auth } from "./index";
import { revokeCurrentUserSessions } from "./userSessionEffects";

/**
 * The one place server-side authentication resolves who is acting. The
 * provider session (Redis, cookie cache bypassed) identifies the account;
 * the current user row from the database is the authority for everything
 * about it. This deliberately adds one user read to every authenticated
 * request compared with the earlier cache-only baseline: a cached user copy
 * can be up to a session's lifetime stale after a direct row write, and the
 * settings flows commit such writes (email finalization, security version).
 *
 * Used by `getFreshSession` (pages, the root layout), by the action
 * builder's session resolution and by the auth HTTP boundary. It imports no
 * settings service and installs no callback.
 */

type ProviderSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type AuthoritativeSession = ProviderSession;

/** Raised when the authority read or a required barrier reconciliation could not run. */
export class SessionAuthorityUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SessionAuthorityUnavailableError";
  }
}

/** Explicit projection: the reset cutoff (`returned: false`) never travels with a session. */
const authorityColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  image: user.image,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  role: user.role,
  banned: user.banned,
  banReason: user.banReason,
  banExpires: user.banExpires,
  twoFactorRequired: user.twoFactorRequired,
  twoFactorEnabled: user.twoFactorEnabled,
  securityVersion: user.securityVersion,
  sessionRevocationPending: user.sessionRevocationPending,
};

async function loadUserRow(userId: string) {
  try {
    const [row] = await db.select(authorityColumns).from(user).where(eq(user.id, userId)).limit(1);
    return row ?? null;
  } catch (error) {
    throw new SessionAuthorityUnavailableError("The account could not be read.", { cause: error });
  }
}

/** `banned IS TRUE AND (ban_expires IS NULL OR ban_expires > now)`; an expiry at `now` has passed. */
export function isEffectivelyBanned(
  row: { banned: boolean | null | undefined; banExpires: Date | null | undefined },
  now: Date,
): boolean {
  if (row.banned !== true) return false;
  if (!row.banExpires) return true;
  return row.banExpires.getTime() > now.getTime();
}

/**
 * Resolves the session and returns it with the *current* user row merged
 * over the provider's cached copy, or `null` for anonymous callers, missing
 * or effectively banned accounts, and for an account whose revocation
 * barrier was pending: that barrier is reconciled first (every session
 * revoked, the flags cleared for the generation observed), and the session
 * that was just loaded is never honoured, even when clearing the flag lost
 * a race with a newer security change.
 */
export async function resolveAuthoritativeSession(
  headers: Headers,
): Promise<AuthoritativeSession | null> {
  const resolved = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!resolved) return null;

  const row = await loadUserRow(resolved.user.id);
  if (!row || isEffectivelyBanned(row, new Date())) return null;

  if (row.sessionRevocationPending) {
    await reconcileRevocationBarrier(row.id, row.securityVersion);
    return null;
  }

  return { session: resolved.session, user: { ...resolved.user, ...row } };
}

/**
 * Finishes a committed email change whose revocation did not complete:
 * revoke everything, then clear the user flag only if the security version
 * is still the one observed before revoking. A newer concurrent change keeps
 * its own barrier; the next request reconciles it. Infrastructure failures
 * propagate as unavailable and leave both flags set.
 */
export async function reconcileRevocationBarrier(
  userId: string,
  observedVersion: number,
): Promise<{ cleared: boolean }> {
  try {
    await revokeCurrentUserSessions(userId);
  } catch (error) {
    throw new SessionAuthorityUnavailableError(
      "Pending session revocation could not be completed.",
      { cause: error },
    );
  }
  return clearRevocationBarrier(userId, observedVersion);
}

/**
 * The version-conditional clear alone, for callers that performed the
 * revocation themselves (email finalization). Idempotent; no lock is taken.
 */
export async function clearRevocationBarrier(
  userId: string,
  observedVersion: number,
): Promise<{ cleared: boolean }> {
  try {
    return await db.transaction(async (tx) => {
      const result = await tx.execute(
        sql`UPDATE "user" SET session_revocation_pending = false
            WHERE id = ${userId} AND security_version = ${observedVersion} AND session_revocation_pending`,
      );
      const cleared = (result.rowCount ?? 0) > 0;
      if (cleared) {
        await tx
          .update(emailChangeRequest)
          .set({ sessionRevocationPending: false })
          .where(
            and(
              eq(emailChangeRequest.userId, userId),
              eq(emailChangeRequest.state, "completed"),
              eq(emailChangeRequest.sessionRevocationPending, true),
            ),
          );
      }
      return { cleared };
    });
  } catch (error) {
    throw new SessionAuthorityUnavailableError(
      "The session revocation barrier could not be updated.",
      { cause: error },
    );
  }
}
