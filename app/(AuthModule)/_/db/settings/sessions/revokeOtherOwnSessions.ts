import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { revokeSessionsByToken } from "@/src/lib/auth/userSessionEffects";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";
import { listOwnedSessions } from "./ownedSessions";
import { confirmRevocation, unconfirmedRevocation } from "./revocation";

/** Every session except the current one; nothing is written to the account row. */
export async function revokeOtherOwnSessions(ctx: AuthedCtx): Promise<SyncOutcome> {
  return withUserAccountLock(ctx, ctx.user.id, async () => {
    const others = (await listOwnedSessions(ctx)).filter((session) => session.id !== ctx.session.id);
    if (others.length === 0) return { status: "unchanged" };

    const tokens = others.map((session) => session.token);
    const confirmed = await confirmRevocation(ctx, "other-session revocation not confirmed", () =>
      revokeSessionsByToken(tokens),
    );
    if (!confirmed) return unconfirmedRevocation;
    return { status: "completed" };
  });
}
