import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { isUuid } from "@/src/lib/isUuid";
import { findEmailOwner, type EmailOwner } from "@/app/(AuthModule)/_/db/emailRequests/owner";
import { findOwnedRequest, type EmailChangeRequestRow } from "@/app/(AuthModule)/_/db/emailRequests/requests";
import { markExpired } from "@/app/(AuthModule)/_/db/emailRequests/transitions";
import { expiredRequestError, inactiveRequestError } from "@/app/(AuthModule)/_/errors/emailRequest";
import { accountNotFoundError } from "@/app/(AuthModule)/_/errors/settings";
import { isActive, isExpired } from "@/app/(AuthModule)/_/policies/emailRequest";

/** The actor's sign-in address as the database has it now. */
export async function requireEmailOwner(ctx: AuthedCtx): Promise<EmailOwner> {
  const owner = await findEmailOwner(ctx);
  if (!owner) throw accountNotFoundError();
  return owner;
}

/**
 * The actor's active request by ID, or the closed lifecycle refusal. An
 * overdue request is marked expired on the way: that write stands, and the
 * refusal says so.
 */
export async function requireOwnedRequest(
  ctx: AuthedCtx,
  requestId: string,
  now: Date,
): Promise<EmailChangeRequestRow> {
  if (!isUuid(requestId)) throw inactiveRequestError();
  const request = await findOwnedRequest(ctx, requestId);
  if (!request || !isActive(request)) throw inactiveRequestError();
  if (isExpired(request, now)) {
    await markExpired(ctx, request.id);
    throw expiredRequestError();
  }
  return request;
}
