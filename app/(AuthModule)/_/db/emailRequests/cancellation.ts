import "server-only";

import { db } from "@/src/lib/db";
import { cancelActiveRequestsWhere } from "./transitions";

/**
 * Provider hook (`emailVerification.afterEmailVerification`): once the
 * ordinary flow verified an address, a pending correction of it must not
 * remain. One conditional statement. The hook is trusted provider code with
 * no application context, so this is the one entry function here without a
 * `ctx`; no authority is decided by it: finalization re-reads the locked
 * user row and refuses a correction for a verified address regardless.
 */
export async function cancelCorrectionsForVerifiedAddress(userId: string): Promise<void> {
  await cancelActiveRequestsWhere(db, userId, "account_changed", "correction");
}
