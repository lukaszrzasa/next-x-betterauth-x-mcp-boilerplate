import "server-only";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { revokeSessionsByToken } from "@/src/lib/auth/userSessionEffects";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import type { SessionTargetSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";
import { listOwnedSessions } from "./ownedSessions";
import { confirmRevocation, unconfirmedRevocation } from "./revocation";

/** One other session, by its public ID, resolved among the actor's own; the current one is never a target. */
export async function revokeOwnSession(ctx: AuthedCtx, input: SessionTargetSchema): Promise<SyncOutcome> {
  return withUserAccountLock(ctx, ctx.user.id, async () => {
    const target = (await listOwnedSessions(ctx)).find((session) => session.id === input.sessionId);
    if (!target || target.id === ctx.session.id) return { status: "unchanged" };

    const confirmed = await confirmRevocation(ctx, "single session revocation not confirmed", async () => {
      await auth.api.revokeSession({ body: { token: target.token }, headers: ctx.getRequestHeaders() });
      await revokeSessionsByToken([target.token]);
    });
    if (!confirmed) return unconfirmedRevocation;
    // TODO(audit): Persist settings.session.revoked (actor user ID, revoked
    // session ID, UTC time). Never the token.
    return { status: "completed" };
  });
}
