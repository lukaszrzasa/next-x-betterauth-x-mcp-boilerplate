import "server-only";

import { findAttemptByRecordKey } from "@/app/(LogsModule)/_/db/email/findAttempt";
import { insertInitialAttempt } from "@/app/(LogsModule)/_/db/email/insertAttempt";
import type { BeginEmailLogInput } from "@/app/(LogsModule)/_/schema";
import { LogRecordingError, type LogContext, type RecordResult } from "@/app/(LogsModule)/_/types";
import { prepareInitiation } from "./prepareInitiation";
import { recordRetry } from "./recordRetry";
import { replayOrConflict } from "./recordKeyReplay";

/**
 * Records that a sending attempt starts: the redacted initiation snapshot,
 * as `sending`. Nothing is sent, resent or reconstructed here. The snapshot
 * never changes afterwards (the database enforces it); `completeEmailLog`
 * records what was observed.
 *
 * Idempotent on `recordKey`: the same sanitized payload from the same
 * requester returns the original ID with `duplicate: true`; anything else
 * under that key is `RECORD_KEY_CONFLICT`. With `previousAttemptId` the
 * attempt is a retry, a new row in the predecessor's chain (`recordRetry`).
 *
 * Internal and server-only: a plain function of a trusted operation,
 * called with the genuine context that operation holds, and never a Server
 * Action, endpoint or MCP tool. The requester is that context's, an
 * anonymous one included. Throws only `LogRecordingError`, without a cause.
 */
export async function beginEmailLog(ctx: LogContext, input: BeginEmailLogInput): Promise<RecordResult> {
  try {
    const { attempt, previousAttemptId } = await prepareInitiation(ctx, input);
    if (previousAttemptId !== null) return await recordRetry(ctx, attempt, previousAttemptId);

    // The unique key arbitrates a race; nothing is looked up before the insert.
    const id = await insertInitialAttempt(ctx, attempt);
    if (id) return { id, duplicate: false };

    // The key's row is committed, and visible to the statement after the one it refused.
    const recorded = await findAttemptByRecordKey(ctx, attempt.recordKey);
    if (!recorded) throw new LogRecordingError("STORAGE_FAILED");
    return replayOrConflict(recorded, attempt.inputDigest);
  } catch (error) {
    throw LogRecordingError.from(error);
  }
}
