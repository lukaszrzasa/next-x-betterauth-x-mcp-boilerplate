import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { isAddressTaken } from "@/app/(AuthModule)/_/db/emailRequests/owner";
import type { EmailChangeRequestRow } from "@/app/(AuthModule)/_/db/emailRequests/requests";
import { markCancelled, selectNewAddress } from "@/app/(AuthModule)/_/db/emailRequests/transitions";
import {
  addressUnavailableError,
  addressUnchangedError,
  inactiveRequestError,
} from "@/app/(AuthModule)/_/errors/emailRequest";
import { lifecycleError } from "@/app/(AuthModule)/_/errors/settings";
import { selectNewEmailSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { deliverLink } from "@/app/(AuthModule)/_/services/email/delivery";
import { issueToken } from "@/app/(AuthModule)/_/services/email/tokens";
import type { EmailRequestOutcome } from "@/app/(AuthModule)/_/types/settings";
import { requireEmailOwner, requireOwnedRequest } from "./ownedRequest";
import { pendingOutcome } from "./pendingRequest";

/** Only a change whose current mailbox has agreed may choose its destination, and only once. */
function assertAwaitingNewAddress(request: EmailChangeRequestRow): void {
  if (request.state === "awaiting_new_address" && request.currentConfirmedAt !== null) return;
  const message =
    request.state === "awaiting_new"
      ? "The new address is already chosen. Cancel and start again to change it."
      : "Confirm your current address first.";
  throw lifecycleError("CONFLICT", "INACTIVE", message);
}

/**
 * After the current mailbox agreed: the destination, chosen once and mailed
 * its own proof. Authorization was recorded at initiation; within the
 * request window no password is repeated.
 */
export const selectNewEmailOperation = defineAction({
  name: "settings.emailChange.selectNewAddress",
  schema: selectNewEmailSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<EmailRequestOutcome> => {
    const now = new Date();
    const request = await requireOwnedRequest(ctx, input.requestId, now);
    assertAwaitingNewAddress(request);

    const owner = await requireEmailOwner(ctx);
    if (owner.email !== request.originalEmail) {
      await markCancelled(ctx, request.id, "account_changed", now);
      throw inactiveRequestError();
    }
    if (input.newEmail === request.originalEmail) throw addressUnchangedError();
    if (await isAddressTaken(ctx, input.newEmail)) throw addressUnavailableError();

    const { token, hash } = issueToken();
    // The statement repeats owner, stage and deadline: a request that moved
    // on since it was read stores nothing, and nothing is mailed for it.
    const selected = await selectNewAddress(ctx, {
      requestId: request.id,
      newEmail: input.newEmail,
      newTokenHash: hash,
      now,
    });
    if (!selected) throw inactiveRequestError();

    const delivery = await deliverLink(ctx, {
      to: input.newEmail,
      purpose: "new",
      token,
      expiresAt: selected.expiresAt,
    });
    return pendingOutcome(ctx, selected, delivery);
  },
});
