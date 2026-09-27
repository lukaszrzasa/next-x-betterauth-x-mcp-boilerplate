import "server-only";

import { eq, or } from "drizzle-orm";

import type { PublicCtx } from "@/src/lib/auth/builders/context";
import type { SqlReader } from "@/src/lib/auth/securityVersion";
import { emailChangeRequest } from "@/src/lib/db";
import type { EmailChangePurpose } from "@/src/lib/email";
import { consumeBudget } from "@/src/lib/throttle";
import { EMAIL_CHANGE_POLICY, type FixedWindow } from "@/app/(AuthModule)/_/db/settings/shared/policy";
import { rateLimitedError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/db/settings/shared/throttleKeys";
import type { EmailChangeRequestRow } from "./requests";

export type ProofMatch = { row: EmailChangeRequestRow; purpose: EmailChangePurpose };

/** The request a token digest proves, and which mailbox it proves. */
export async function findByTokenHash(reads: SqlReader, hash: string): Promise<ProofMatch | null> {
  const [row] = await reads
    .select()
    .from(emailChangeRequest)
    .where(or(eq(emailChangeRequest.currentTokenHash, hash), eq(emailChangeRequest.newTokenHash, hash)))
    .limit(1);
  if (!row) return null;
  return { row, purpose: row.currentTokenHash === hash ? "current" : "new" };
}

/** Whether the token was issued for the stage the request is at now; an earlier stage's link proves nothing. */
export function provesCurrentStage({ row, purpose }: ProofMatch): boolean {
  if (purpose === "current") return row.state === "awaiting_current";
  return row.state === "awaiting_new";
}

async function charge(key: string, window: FixedWindow): Promise<void> {
  const budget = await consumeBudget(key, window.limit, window.windowSeconds);
  if (!budget.allowed) throw rateLimitedError(budget.retryAfterSeconds, "Too many attempts. Try again later.");
}

/** Charges a submit to its request, or, for a token that matches nothing, to the client IP. */
export function chargeProofAttempt(ctx: PublicCtx, requestId: string | null): Promise<void> {
  if (requestId) {
    return charge(settingsThrottleKeys.proofAttempts(requestId), EMAIL_CHANGE_POLICY.proofAttemptsPerRequest);
  }
  return charge(settingsThrottleKeys.unknownProofsFromIp(ctx.ip ?? "unknown"), EMAIL_CHANGE_POLICY.unknownProofsPerIp);
}
