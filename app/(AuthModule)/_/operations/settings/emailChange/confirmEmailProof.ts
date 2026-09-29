import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import type { PublicCtx } from "@/src/lib/auth/builders/context";
import { findRequestByTokenHash } from "@/app/(AuthModule)/_/db/emailRequests/requests";
import { confirmCurrentAddress, expireIfOverdue } from "@/app/(AuthModule)/_/db/emailRequests/transitions";
import { isActive, purposeOf } from "@/app/(AuthModule)/_/policies/emailRequest";
import { emailProofSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { chargeProofAttempt } from "@/app/(AuthModule)/_/services/email/budgets";
import { hashToken } from "@/app/(AuthModule)/_/services/email/tokens";
import type { EmailProofOutcome } from "@/app/(AuthModule)/_/types/settings";
import { finalizeNewAddress } from "./finalizeNewAddress";

/**
 * The current mailbox agreed: one conditional statement consumes the proof
 * and moves the request on to choosing the new address, so a rotated or
 * spent token proves nothing and two submits cannot both count.
 */
async function confirmCurrentMailbox(ctx: PublicCtx, requestId: string, tokenHash: string): Promise<EmailProofOutcome> {
  const now = new Date();
  if (await confirmCurrentAddress(ctx, { requestId, tokenHash, now })) return { status: "current-confirmed" };
  if (await expireIfOverdue(ctx, requestId, now)) return { status: "expired" };
  return { status: "inactive" };
}

/**
 * The explicit submit of the emailed link. Public on purpose: the token
 * alone identifies the request and the purpose; whoever is signed in on
 * that browser is irrelevant. A current-mailbox proof records itself; a
 * new-mailbox proof commits the change.
 */
export const confirmEmailProofOperation = defineAction({
  name: "settings.emailProof.confirm",
  auth: "public",
  schema: emailProofSchema,
  mcpAllowed: false,
  handler: async (ctx, input): Promise<EmailProofOutcome> => {
    const hash = hashToken(input.token);
    const request = await findRequestByTokenHash(ctx, hash);
    // Every submit is charged, to its request or to the client's address,
    // before it learns whether the token matched anything.
    await chargeProofAttempt(ctx, request?.id ?? null);
    if (!request || !isActive(request)) return { status: "inactive" };

    if (purposeOf(request, hash) === "current") return confirmCurrentMailbox(ctx, request.id, hash);
    return finalizeNewAddress(ctx, { requestId: request.id, userId: request.userId, tokenHash: hash });
  },
});
