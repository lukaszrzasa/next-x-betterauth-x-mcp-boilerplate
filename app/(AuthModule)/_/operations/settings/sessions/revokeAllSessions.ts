import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { revokeCurrentUserSessions } from "@/src/lib/auth/userSessionEffects";
import { confirmRevocation, unconfirmedRevocation } from "@/app/(AuthModule)/_/services/sessions/revocation";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";

/** Sign out everywhere, this device included; the caller navigates to sign-in afterwards. */
export const revokeAllSessionsOperation = defineAction({
  name: "settings.sessions.revokeAll",
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx): Promise<SyncOutcome> => {
    const confirmed = await confirmRevocation(ctx, "sign-out everywhere not confirmed", () =>
      revokeCurrentUserSessions(ctx.user.id),
    );
    if (!confirmed) return unconfirmedRevocation;
    return { status: "completed", selfSignedOut: true };
  },
});
