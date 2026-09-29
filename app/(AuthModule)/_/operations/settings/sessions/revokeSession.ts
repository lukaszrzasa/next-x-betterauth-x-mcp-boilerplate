import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { revokeSessionsByToken } from "@/src/lib/auth/userSessionEffects";
import { sessionTargetSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { listOwnedSessions } from "@/app/(AuthModule)/_/services/sessions/ownedSessions";
import { confirmRevocation, unconfirmedRevocation } from "@/app/(AuthModule)/_/services/sessions/revocation";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";

/**
 * One other session, by its public ID, resolved among the actor's own
 * before anything is looked up by token; the current one is never a target.
 * Confirmation in the UI, no step-up.
 */
export const revokeSessionOperation = defineAction({
  name: "settings.sessions.revokeOne",
  schema: sessionTargetSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<SyncOutcome> => {
    const target = (await listOwnedSessions(ctx)).find((session) => session.id === input.sessionId);
    if (!target || target.id === ctx.session.id) return { status: "unchanged" };

    const confirmed = await confirmRevocation(ctx, "single session revocation not confirmed", async () => {
      await auth.api.revokeSession({ body: { token: target.token }, headers: ctx.getRequestHeaders() });
      await revokeSessionsByToken([target.token]);
    });
    if (!confirmed) return unconfirmedRevocation;
    return { status: "completed" };
  },
});
