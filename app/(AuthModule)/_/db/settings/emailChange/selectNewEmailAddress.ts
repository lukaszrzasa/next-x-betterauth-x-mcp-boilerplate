import "server-only";

import { and, eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, emailChangeRequest } from "@/src/lib/db";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { lifecycleError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import type { SelectNewEmailSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { EmailRequestOutcome } from "@/app/(AuthModule)/_/types/settings";
import { deliverLink } from "./delivery";
import { addressUnchangedError, inactiveRequestError } from "./errors";
import { assertAddressAvailable, loadOwner } from "./owner";
import { pendingOutcome } from "./projection";
import { markCancelled, requireOwnedRequest, type EmailChangeRequestRow } from "./requests";
import { issueToken } from "./tokens";

/** Only a change whose current mailbox has agreed may choose its destination, and only once. */
function assertAwaitingNewAddress(request: EmailChangeRequestRow): void {
  if (request.state === "awaiting_new_address" && request.currentConfirmedAt !== null) return;
  const message =
    request.state === "awaiting_new"
      ? "The new address is already chosen. Cancel and start again to change it."
      : "Confirm your current address first.";
  throw lifecycleError("CONFLICT", "INACTIVE", message);
}

/** After the current mailbox agreed: the destination, chosen once, mailed its own proof. */
export async function selectNewEmailAddress(
  ctx: AuthedCtx,
  input: SelectNewEmailSchema,
): Promise<EmailRequestOutcome> {
  const { token, hash } = issueToken();
  const row = await withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const now = new Date();
    const request = await requireOwnedRequest(reads, ctx.user.id, input.requestId, now);
    assertAwaitingNewAddress(request);
    const owner = await loadOwner(reads, ctx.user.id);
    if (owner.email !== request.originalEmail) {
      await markCancelled(db, request.id, "account_changed", now);
      throw inactiveRequestError();
    }
    if (input.newEmail === request.originalEmail) throw addressUnchangedError();
    await assertAddressAvailable(reads, input.newEmail, ctx.user.id);

    const [updated] = await db
      .update(emailChangeRequest)
      .set({
        state: "awaiting_new",
        newEmail: input.newEmail,
        newTokenHash: hash,
        newTokenGeneration: request.newTokenGeneration + 1,
      })
      .where(and(eq(emailChangeRequest.id, request.id), eq(emailChangeRequest.state, "awaiting_new_address")))
      .returning();
    if (!updated) throw inactiveRequestError();
    // TODO(audit): Persist settings.email_request.destination_selected (request
    // ID, actor user ID, UTC time, new address). Never the token or digest.
    return updated;
  });

  const delivery = await deliverLink(ctx, { to: input.newEmail, purpose: "new", token, expiresAt: row.expiresAt });
  return pendingOutcome(row, delivery);
}
