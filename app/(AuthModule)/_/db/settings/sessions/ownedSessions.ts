import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { listActiveUserSessions, type OwnedSession } from "@/src/lib/auth/userSessionEffects";
import type { SessionItem } from "@/app/(AuthModule)/_/types/settings";

/**
 * The actor's own active sessions. Tokens stay inside these rows: callers
 * resolve a public session ID among them, so an ID that is not the actor's
 * matches nothing and never falls through to a token lookup.
 */
export function listOwnedSessions(ctx: AuthedCtx): Promise<OwnedSession[]> {
  return listActiveUserSessions(ctx.user.id);
}

/** The current session first, then newest first; the ID breaks ties so pages are stable. */
export function byCurrentThenNewest(currentId: string) {
  return (a: OwnedSession, b: OwnedSession): number => {
    if (a.id === currentId) return -1;
    if (b.id === currentId) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
  };
}

/** What the page may see of a session: never its token. */
export function toSessionItem(session: OwnedSession, currentId: string): SessionItem {
  return {
    id: session.id,
    isCurrent: session.id === currentId,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
  };
}
