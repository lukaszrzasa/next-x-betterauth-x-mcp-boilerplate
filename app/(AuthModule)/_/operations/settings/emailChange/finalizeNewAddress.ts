import "server-only";

import type { PublicCtx } from "@/src/lib/auth/builders/context";
import { clearRevocationBarrier } from "@/src/lib/auth/sessionAuthority";
import { revokeCurrentUserSessions } from "@/src/lib/auth/userSessionEffects";
import { errorMessage } from "@/src/lib/errorMessage";
import { finalizeEmailChange, type LockedFinalization } from "@/app/(AuthModule)/_/db/emailRequests/finalization";
import { markCancelled } from "@/app/(AuthModule)/_/db/emailRequests/transitions";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { finalizationBlocker, isExpired } from "@/app/(AuthModule)/_/policies/emailRequest";
import type { EmailProofOutcome } from "@/app/(AuthModule)/_/types/settings";

type Proof = { requestId: string; userId: string; tokenHash: string };

type Refused = Exclude<EmailProofOutcome, { status: "completed" | "current-confirmed" }>;
type Decision = Refused | { status: "committed"; userId: string; securityVersion: number };

/**
 * Decides against the locked rows, inside the finalization transaction. A
 * refusal that closes the request (`expire`, `cancel`) is *returned*, never
 * thrown, so that the transition it wrote commits with it.
 */
function decideFinalization(tokenHash: string, now: Date) {
  return async (locked: LockedFinalization | null): Promise<Decision> => {
    if (!locked) return { status: "inactive" };
    const { account, request, writes } = locked;

    const newEmail = request.newEmail;
    if (request.state !== "awaiting_new" || request.newTokenHash !== tokenHash || !newEmail) {
      return { status: "inactive" };
    }
    if (isExpired(request, now)) {
      await writes.expire();
      return { status: "expired" };
    }
    const blocker = finalizationBlocker(account, request, now);
    if (blocker) {
      await writes.cancel(blocker);
      return { status: "account-changed" };
    }
    if (newEmail === account.email || (await writes.isTakenByAnotherAccount(newEmail))) {
      await writes.cancel("account_changed");
      return { status: "destination-unavailable" };
    }

    const securityVersion = await writes.commitNewAddress(newEmail);
    return { status: "committed", userId: account.id, securityVersion };
  };
}

/**
 * After the commit, outside any transaction: revoke and confirm, then clear
 * the barrier for the generation observed. Until then the barrier refuses
 * every session of the account; a failure here keeps it.
 */
async function revokeAfterCommit(ctx: PublicCtx, userId: string, securityVersion: number): Promise<EmailProofOutcome> {
  try {
    await revokeCurrentUserSessions(userId);
    await clearRevocationBarrier(userId, securityVersion);
    return { status: "completed", sessionRevocationPending: false };
  } catch (error) {
    ctx.log.error("email changed; session revocation not confirmed, barrier retained", { error: errorMessage(error) });
    return { status: "completed", sessionRevocationPending: true };
  }
}

/**
 * The new mailbox agreed: commit the address and the proof's consumption in
 * one transaction, then sign every session out.
 */
export async function finalizeNewAddress(ctx: PublicCtx, proof: Proof): Promise<EmailProofOutcome> {
  // Security lock: the address is a credential-bearing column, and password
  // changes, bans and administrative address changes write it or depend on
  // it through the provider, on a connection no row lock here can hold.
  return withAccountSecurityLock(ctx, proof.userId, async () => {
    const now = new Date();
    const finalized = await finalizeEmailChange(
      ctx,
      { requestId: proof.requestId, now },
      decideFinalization(proof.tokenHash, now),
    );

    if (finalized.conflict) {
      // Another account claimed the address first; the transaction rolled back.
      await markCancelled(ctx, proof.requestId, "account_changed", now);
      return { status: "destination-unavailable" };
    }
    const decision = finalized.result;
    if (decision.status !== "committed") return decision;
    return revokeAfterCommit(ctx, decision.userId, decision.securityVersion);
  });
}
