import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { isUuid } from "@/src/lib/isUuid";
import { cancelSetupRequest } from "@/app/(AuthModule)/_/db/authenticator/setupRequests";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { setupTargetSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { CancelOutcome } from "@/app/(AuthModule)/_/types/settings";

/**
 * Abandons the actor's own attempt, the one named by the request: a newer
 * attempt is not cancelled in its place. An enrollment's unverified row
 * goes with it; the active factor is never written.
 */
export const cancelSetupOperation = defineAction({
  name: "settings.authenticator.cancelSetup",
  schema: setupTargetSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<CancelOutcome> => {
    if (!isUuid(input.requestId)) return { status: "unchanged" };

    // Security lock: cancelling an enrollment deletes the provider's pending
    // factor row, which a concurrent confirmation is about to verify.
    const cancelled = await withAccountSecurityLock(ctx, ctx.user.id, () =>
      cancelSetupRequest(ctx, input.requestId, new Date()),
    );
    return { status: cancelled ? "completed" : "unchanged" };
  },
});
