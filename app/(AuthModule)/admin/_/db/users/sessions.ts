import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { revokeCurrentUserSessions } from "@/src/lib/auth/userSessionEffects";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import type { UserTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import type { FailedEffect, UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { attemptEffect, conclude } from "./outcomes";
import { authorizeTargetAction } from "./targets";

/** Signing a user out everywhere: idempotent, and never a ban. */

export async function revokeUserSessions(
  ctx: AuthedCtx,
  input: UserTargetSchema,
): Promise<UserMutationOutcome> {
  return withUserAccountLock(ctx, input.userId, async (reads) => {
    const { target } = await authorizeTargetAction(ctx, reads, input.userId, "revokeSessions");
    const failed: FailedEffect[] = [];
    await attemptEffect(ctx, "session-revocation", () => revokeCurrentUserSessions(target.id), failed);
    // TODO(audit): Persist users.sessions.revoked after this effect. Include
    // ctx.requestId, actor user ID, target user ID, UTC time and outcome
    // (confirmed / not confirmed). Never include session objects or tokens.
    return conclude(target.id, false, failed, { selfSignedOut: target.id === ctx.user.id });
  });
}
