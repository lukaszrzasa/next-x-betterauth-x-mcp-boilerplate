import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import type { EmailOwner } from "@/app/(AuthModule)/_/db/emailRequests/owner";
import { findActiveRequest, type EmailChangeRequestRow } from "@/app/(AuthModule)/_/db/emailRequests/requests";
import { markCancelled, markExpired } from "@/app/(AuthModule)/_/db/emailRequests/transitions";
import { inactiveRequestError } from "@/app/(AuthModule)/_/errors/emailRequest";
import { isExpired, isSuperseded } from "@/app/(AuthModule)/_/policies/emailRequest";
import { resendAvailableAt, type Delivery } from "@/app/(AuthModule)/_/services/email/delivery";
import type { EmailRequestOutcome, PendingEmailRequest } from "@/app/(AuthModule)/_/types/settings";

/** The owner's view of their request: its stage, addresses, deadline and resend availability. */
async function toPendingEmailRequest(
  ctx: AuthedCtx,
  request: EmailChangeRequestRow,
  now: Date,
): Promise<PendingEmailRequest> {
  const base = { id: request.id, originalEmail: request.originalEmail, expiresAt: request.expiresAt.toISOString() };
  switch (request.state) {
    case "awaiting_current":
      return {
        state: "awaiting_current",
        kind: "change",
        ...base,
        resendAfter: await resendAvailableAt(ctx, "current", now),
      };
    case "awaiting_new_address":
      return { state: "awaiting_new_address", kind: "change", ...base };
    case "awaiting_new":
      return {
        state: "awaiting_new",
        kind: request.kind,
        ...base,
        newEmail: request.newEmail ?? "",
        resendAfter: await resendAvailableAt(ctx, "new", now),
      };
    default:
      return { state: "none" };
  }
}

/** What every step that mails a link returns: the request as it now stands and how the mail went. */
export async function pendingOutcome(
  ctx: AuthedCtx,
  request: EmailChangeRequestRow,
  delivery: Delivery,
): Promise<EmailRequestOutcome> {
  const pending = await toPendingEmailRequest(ctx, request, new Date());
  if (pending.state === "none") throw inactiveRequestError();
  return { status: "pending", request: pending, ...delivery };
}

/**
 * The actor's current request as the account page shows it. A request that
 * could no longer authorize anything is closed on the way, by a conditional
 * write: an overdue one as expired, one the account has moved past as
 * cancelled. The page then shows none.
 */
export async function loadPendingEmailRequest(ctx: AuthedCtx, owner: EmailOwner): Promise<PendingEmailRequest> {
  const now = new Date();
  const request = await findActiveRequest(ctx);
  if (!request) return { state: "none" };

  if (isExpired(request, now)) {
    await markExpired(ctx, request.id);
    return { state: "none" };
  }
  if (isSuperseded(request, owner)) {
    await markCancelled(ctx, request.id, "account_changed", now);
    return { state: "none" };
  }
  return toPendingEmailRequest(ctx, request, now);
}
