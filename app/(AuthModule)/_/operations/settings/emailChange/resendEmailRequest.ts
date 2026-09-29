import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { rotateToken } from "@/app/(AuthModule)/_/db/emailRequests/transitions";
import { inactiveRequestError } from "@/app/(AuthModule)/_/errors/emailRequest";
import { lifecycleError, rateLimitedError } from "@/app/(AuthModule)/_/errors/settings";
import { awaitedMail } from "@/app/(AuthModule)/_/policies/emailRequest";
import { emailRequestTargetSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { checkSendCooldown, reserveDelivery, sendLink } from "@/app/(AuthModule)/_/services/email/delivery";
import { issueToken } from "@/app/(AuthModule)/_/services/email/tokens";
import type { EmailRequestOutcome } from "@/app/(AuthModule)/_/types/settings";
import { requireOwnedRequest } from "./ownedRequest";
import { pendingOutcome } from "./pendingRequest";

/**
 * A fresh link for the stage still awaiting mail; the deadline never moves.
 *
 * Order matters here. The send is paid for before the token rotates, so a
 * refused resend never invalidates the link already in the mailbox; and the
 * rotation is conditional on the stage and token generation that were read,
 * so of two simultaneous resends only one stores, and mails, a token.
 */
export const resendEmailRequestOperation = defineAction({
  name: "settings.emailRequest.resend",
  schema: emailRequestTargetSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<EmailRequestOutcome> => {
    const now = new Date();
    const request = await requireOwnedRequest(ctx, input.requestId, now);
    const stage = awaitedMail(request);
    if (!stage) throw lifecycleError("CONFLICT", "INACTIVE", "There is no email to resend at this step.");

    // Read-only first: inside the cooldown nothing is charged or rotated.
    const cooldown = await checkSendCooldown(ctx, stage.purpose);
    if (!cooldown.allowed) {
      throw rateLimitedError(cooldown.retryAfterSeconds, "Wait a minute before requesting another link.");
    }

    const refusal = await reserveDelivery(ctx, stage.purpose);
    if (refusal) return pendingOutcome(ctx, request, refusal);

    const { token, hash } = issueToken();
    const rotated = await rotateToken(ctx, {
      requestId: request.id,
      purpose: stage.purpose,
      observedState: request.state,
      observedGeneration: stage.generation,
      tokenHash: hash,
      now,
    });
    // Lost to a concurrent step. The reservation above stays charged
    // (cooldown and hourly allowance both); nothing is mailed.
    if (!rotated) throw inactiveRequestError();

    const delivery = await sendLink(ctx, {
      to: stage.to,
      purpose: stage.purpose,
      token,
      expiresAt: rotated.expiresAt,
    });
    return pendingOutcome(ctx, rotated, delivery);
  },
});
