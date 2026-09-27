import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { invalidateStepUpState } from "@/src/lib/auth/stepUp";
import { refreshCommittedUserSessions } from "@/src/lib/auth/userSessionEffects";
import { errorMessage } from "@/src/lib/errorMessage";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";

/**
 * Best-effort removal of the actor's cached step-up grant and challenge.
 * The security-version change already invalidated them; this only cleans
 * up, so a failure is logged and never fails the operation.
 */
export async function discardStepUpState(ctx: AuthedCtx): Promise<void> {
  try {
    await invalidateStepUpState({ userId: ctx.user.id, sessionId: ctx.session.id });
  } catch (error) {
    ctx.log.warn("step-up cleanup failed; the version change still invalidates grants", {
      error: errorMessage(error),
    });
  }
}

/**
 * Re-syncs the cached user copy in every session after a committed change.
 * Returns whether that succeeded; the failure is logged with `failure`.
 */
export async function refreshUserSessions(ctx: AuthedCtx, failure: string): Promise<boolean> {
  try {
    await refreshCommittedUserSessions(ctx.user.id);
    return true;
  } catch (error) {
    ctx.log.error(failure, { error: errorMessage(error) });
    return false;
  }
}

/** The retry a partial outcome offers: refresh again, and change nothing else. */
export async function retrySessionRefresh(ctx: AuthedCtx): Promise<SyncOutcome> {
  if (!(await refreshUserSessions(ctx, "session refresh retry failed"))) {
    return { status: "partial", committed: false, failedEffects: ["session-refresh"] };
  }
  // TODO(audit): Persist settings.session_sync.retried (effect: session-refresh).
  return { status: "completed" };
}
