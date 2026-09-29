import "server-only";

import type { PreparedAttempt } from "@/app/(LogsModule)/_/db/email/insertAttempt";
import { withRetryChain } from "@/app/(LogsModule)/_/db/email/retryTransaction";
import { LogRecordingError, type LogContext, type RecordResult } from "@/app/(LogsModule)/_/types";
import { replayOrConflict } from "./recordKeyReplay";

const predecessorNotFound = () =>
  new LogRecordingError("NOT_FOUND", [{ path: "previousAttemptId", code: "not_found" }]);

/**
 * Records a retry as the next attempt of its predecessor's chain. The
 * predecessor must be the chain's latest attempt (`STALE_PREDECESSOR`) and
 * the recipient must be the chain's (`RECIPIENT_MISMATCH`: another
 * recipient is another chain). Subject and body may differ: a resend
 * regenerates its tokens.
 *
 * Everything from the lock onwards is decided on the locked chain, so
 * competing retries of one predecessor are answered one after another and
 * exactly one of them gets the next number.
 */
export function recordRetry(
  ctx: LogContext,
  attempt: PreparedAttempt,
  previousAttemptId: string,
): Promise<RecordResult> {
  return withRetryChain(ctx, async (chain) => {
    // A replay of this very request is answered before the chain is looked
    // at: once it succeeded, its predecessor is no longer the latest attempt.
    const known = await chain.findByRecordKey(attempt.recordKey);
    if (known) return replayOrConflict(known, attempt.inputDigest);

    const predecessor = await chain.findPredecessor(previousAttemptId);
    if (!predecessor) throw predecessorNotFound();
    const originalId = predecessor.originalLogId ?? predecessor.id;

    const original = await chain.lockOriginal(originalId);
    if (!original) throw predecessorNotFound();

    // Another request may have recorded this key while this one waited for the lock.
    const recorded = await chain.findByRecordKey(attempt.recordKey);
    if (recorded) return replayOrConflict(recorded, attempt.inputDigest);

    // Staleness is answered before the recipient is compared.
    const latest = await chain.findLatestAttempt(originalId);
    if (!latest || latest.id !== previousAttemptId) throw new LogRecordingError("STALE_PREDECESSOR");

    const sameRecipient =
      original.recipientEmail === attempt.recipientEmail && original.recipientUserId === attempt.recipientUserId;
    if (!sameRecipient) throw new LogRecordingError("RECIPIENT_MISMATCH");

    const id = await chain.insertRetry(attempt, {
      attemptNumber: latest.attemptNumber + 1,
      originalLogId: originalId,
      previousAttemptId,
    });
    if (id) return { id, duplicate: false };

    // The key was taken by a request outside this chain, between the recheck and the insert.
    const taken = await chain.findByRecordKey(attempt.recordKey);
    if (!taken) throw new LogRecordingError("STORAGE_FAILED");
    return replayOrConflict(taken, attempt.inputDigest);
  });
}
