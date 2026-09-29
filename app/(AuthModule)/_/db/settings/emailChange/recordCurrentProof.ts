import "server-only";

import { eq } from "drizzle-orm";

import { db, emailChangeRequest } from "@/src/lib/db";
import type { EmailProofOutcome } from "@/app/(AuthModule)/_/types/settings";
import { isExpired, markExpired } from "./requests";

/**
 * The current mailbox agreed: the request moves on to choosing the new
 * address. Validated against the locked row, so a rotated or spent token
 * proves nothing.
 */
export async function recordCurrentProof(requestId: string, hash: string): Promise<EmailProofOutcome> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, requestId)).for("update");
    if (!row || row.state !== "awaiting_current" || row.currentTokenHash !== hash) return { status: "inactive" };
    if (isExpired(row, now)) {
      await markExpired(tx, row.id);
      return { status: "expired" };
    }
    await tx
      .update(emailChangeRequest)
      .set({ state: "awaiting_new_address", currentConfirmedAt: now, currentTokenHash: null })
      .where(eq(emailChangeRequest.id, row.id));
    return { status: "current-confirmed" };
  });
}
