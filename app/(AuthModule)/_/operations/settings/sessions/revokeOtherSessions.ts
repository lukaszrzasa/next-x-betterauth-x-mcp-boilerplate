import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { revokeSessionsByToken } from "@/src/lib/auth/userSessionEffects";
import { listOwnedSessions } from "@/app/(AuthModule)/_/services/sessions/ownedSessions";
import { confirmRevocation, unconfirmedRevocation } from "@/app/(AuthModule)/_/services/sessions/revocation";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";

/** Every session the actor has now except the current one; nothing is written to the account row. */
export const revokeOtherSessionsOperation = defineAction({
  name: "settings.sessions.revokeOthers",
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx): Promise<SyncOutcome> => {
    const others = (await listOwnedSessions(ctx)).filter((session) => session.id !== ctx.session.id);
    if (others.length === 0) return { status: "unchanged" };

    const tokens = others.map((session) => session.token);
    const confirmed = await confirmRevocation(ctx, "other-session revocation not confirmed", () =>
      revokeSessionsByToken(tokens),
    );
    if (!confirmed) return unconfirmedRevocation;
    return { status: "completed" };
  },
});
