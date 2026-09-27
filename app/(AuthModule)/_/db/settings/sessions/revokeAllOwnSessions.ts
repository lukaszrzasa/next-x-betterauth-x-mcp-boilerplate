import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { revokeCurrentUserSessions } from "@/src/lib/auth/userSessionEffects";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";
import { confirmRevocation, unconfirmedRevocation } from "./revocation";

/** Sign out everywhere, this device included; the caller navigates to sign-in afterwards. */
export async function revokeAllOwnSessions(ctx: AuthedCtx): Promise<SyncOutcome> {
  return withUserAccountLock(ctx, ctx.user.id, async () => {
    const confirmed = await confirmRevocation(ctx, "sign-out everywhere not confirmed", () =>
      revokeCurrentUserSessions(ctx.user.id),
    );
    if (!confirmed) return unconfirmedRevocation;
    // TODO(audit): Persist settings.sessions.revoked (actor user ID, UTC time, confirmed).
    return { status: "completed", selfSignedOut: true };
  });
}
