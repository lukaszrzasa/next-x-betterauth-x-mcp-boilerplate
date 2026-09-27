import "server-only";

import type { EmailRequestOutcome, PendingEmailRequest } from "@/app/(AuthModule)/_/types/settings";
import { resendAvailableAt, type Delivery } from "./delivery";
import { inactiveRequestError } from "./errors";
import type { EmailChangeRequestRow } from "./requests";

/** The owner's view of a request row: its stage, addresses, deadline and resend availability. */
export async function toPendingEmailRequest(row: EmailChangeRequestRow, now: Date): Promise<PendingEmailRequest> {
  const base = { id: row.id, originalEmail: row.originalEmail, expiresAt: row.expiresAt.toISOString() };
  switch (row.state) {
    case "awaiting_current":
      return {
        state: "awaiting_current",
        kind: "change",
        ...base,
        resendAfter: await resendAvailableAt(row.userId, "current", now),
      };
    case "awaiting_new_address":
      return { state: "awaiting_new_address", kind: "change", ...base };
    case "awaiting_new":
      return {
        state: "awaiting_new",
        kind: row.kind,
        ...base,
        newEmail: row.newEmail ?? "",
        resendAfter: await resendAvailableAt(row.userId, "new", now),
      };
    default:
      return { state: "none" };
  }
}

/** What every step that mails a link returns: the request as it now stands and how the mail went. */
export async function pendingOutcome(row: EmailChangeRequestRow, delivery: Delivery): Promise<EmailRequestOutcome> {
  const request = await toPendingEmailRequest(row, new Date());
  if (request.state === "none") throw inactiveRequestError();
  return { status: "pending", request, ...delivery };
}
