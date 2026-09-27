import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db } from "@/src/lib/db";
import type { PendingEmailRequest } from "@/app/(AuthModule)/_/types/settings";
import type { EmailOwner } from "./owner";
import { toPendingEmailRequest } from "./projection";
import { findActiveRequest, isExpired, markCancelled, markExpired, type EmailChangeRequestRow } from "./requests";

/** A request the account has moved past: its address changed, or a correction's address got verified. */
const supersededBy = (row: EmailChangeRequestRow, owner: EmailOwner): boolean =>
  row.originalEmail !== owner.email || (row.kind === "correction" && owner.emailVerified);

/**
 * The owner's current request as the account page shows it. Overdue rows
 * are marked expired and superseded ones cancelled on the way: neither
 * could authorize anything, the read only records that.
 */
export async function loadPendingEmailRequest(_ctx: AuthedCtx, owner: EmailOwner): Promise<PendingEmailRequest> {
  const now = new Date();
  const row = await findActiveRequest(db, owner.id);
  if (!row) return { state: "none" };
  if (isExpired(row, now)) {
    await markExpired(db, row.id);
    return { state: "none" };
  }
  if (supersededBy(row, owner)) {
    await markCancelled(db, row.id, "account_changed", now);
    return { state: "none" };
  }
  return toPendingEmailRequest(row, now);
}
