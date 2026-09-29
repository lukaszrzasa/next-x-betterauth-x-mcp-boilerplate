import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { acquireCooldown, consumeBudget, isCoolingDown } from "@/src/lib/throttle";
import { rateLimitedError } from "@/app/(AuthModule)/admin/_/errors";

/**
 * Server-side limits for the two administrative email actions, which call
 * provider APIs directly and so never pass the HTTP rate limiter:
 *
 * - one attempt per target and action every 60 seconds (a `SET NX EX` claim);
 * - at most 20 attempts per actor across both actions in a fixed 10-minute
 *   window (the shared fixed-window counter).
 *
 * Attempts are consumed before sending and stay consumed when sending fails.
 * The verification cooldown is shared with the email change's automatic
 * verification, so a change followed by a resend waits the same minute.
 */

export type AdminEmailAction = "verification" | "password-reset";

export const ADMIN_EMAIL_TARGET_COOLDOWN_SECONDS = 60;
export const ADMIN_EMAIL_ACTOR_LIMIT = 20;
export const ADMIN_EMAIL_ACTOR_WINDOW_SECONDS = 10 * 60;

const targetKey = (action: AdminEmailAction, targetUserId: string) =>
  `admin-email:target:${action}:${targetUserId}`;
const actorKey = (actorUserId: string) => `admin-email:actor:${actorUserId}`;

/**
 * Consumes one attempt for `action` against `targetUserId`, or throws
 * `RATE_LIMITED` with the seconds to wait. The target cooldown is checked
 * read-only first so a blocked target does not spend the actor's budget,
 * then the budget is spent, then the cooldown is claimed atomically.
 */
export async function consumeAdminEmailAttempt(
  ctx: AuthedCtx,
  action: AdminEmailAction,
  targetUserId: string,
): Promise<void> {
  const cooling = await isCoolingDown(targetKey(action, targetUserId));
  if (!cooling.allowed) throw rateLimitedError(cooling.retryAfterSeconds);

  const budget = await consumeBudget(
    actorKey(ctx.user.id),
    ADMIN_EMAIL_ACTOR_LIMIT,
    ADMIN_EMAIL_ACTOR_WINDOW_SECONDS,
  );
  if (!budget.allowed) throw rateLimitedError(budget.retryAfterSeconds);

  const claimed = await acquireCooldown(
    targetKey(action, targetUserId),
    ADMIN_EMAIL_TARGET_COOLDOWN_SECONDS,
  );
  if (!claimed.allowed) throw rateLimitedError(claimed.retryAfterSeconds);
}
