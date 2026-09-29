import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { isUuid } from "@/src/lib/isUuid";
import { cancelOwnedRequest } from "@/app/(AuthModule)/_/db/emailRequests/transitions";
import { emailRequestTargetSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { CancelOutcome } from "@/app/(AuthModule)/_/types/settings";

/**
 * Withdraws the actor's pending change. No proof is needed: nothing is
 * committed by it, and a request that is not theirs or no longer active is
 * simply not there to withdraw.
 */
export const cancelEmailRequestOperation = defineAction({
  name: "settings.emailRequest.cancel",
  schema: emailRequestTargetSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<CancelOutcome> => {
    if (!isUuid(input.requestId)) return { status: "unchanged" };
    const cancelled = await cancelOwnedRequest(ctx, input.requestId, new Date());
    return { status: cancelled ? "completed" : "unchanged" };
  },
});
