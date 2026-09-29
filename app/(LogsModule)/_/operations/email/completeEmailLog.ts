import "server-only";

import { tryCompleteAttempt } from "@/app/(LogsModule)/_/db/email/completeAttempt";
import { findCompletionState } from "@/app/(LogsModule)/_/db/email/findAttempt";
import type { CompleteEmailLogInput } from "@/app/(LogsModule)/_/schema";
import {
  LogRecordingError,
  type EmailCompletionStatus,
  type EmailLogStatus,
  type LogContext,
  type RecordResult,
} from "@/app/(LogsModule)/_/types";
import { prepareCompletion } from "./prepareCompletion";

/**
 * The statuses each observation may be recorded from. `sending` takes any
 * of the three; `unknown` is resolved once, to `accepted` or `failed`;
 * `accepted` and `failed` are final.
 */
const COMPLETABLE_FROM: Record<EmailCompletionStatus, readonly EmailLogStatus[]> = {
  accepted: ["sending", "unknown"],
  failed: ["sending", "unknown"],
  unknown: ["sending"],
};

/**
 * Records the observed outcome of an attempt: `accepted` (the provider took
 * it - not delivered), `failed`, or `unknown`.
 *
 * - The identical observation again returns `duplicate: true` and writes nothing.
 * - Resolving `unknown` replaces the diagnostics with exactly what the
 *   resolving caller supplies (an old timeout is not kept as if it were the
 *   failure's cause) and keeps a provider message ID it does not replace.
 * - Anything else is `COMPLETION_CONFLICT`: history is never overwritten.
 *
 * The write is one conditional statement, so two completions of one attempt
 * are ordered by the database and the second is judged against what the
 * first recorded. A row left in `sending` is never converted by this module.
 *
 * Internal and server-only, like `beginEmailLog`. The context is the
 * provenance of a trusted call, not ownership: whoever completes an attempt
 * need not be who requested it. Throws only `LogRecordingError`, without a cause.
 */
export async function completeEmailLog(ctx: LogContext, input: CompleteEmailLogInput): Promise<RecordResult> {
  try {
    const completion = await prepareCompletion(input);
    const completableFrom = COMPLETABLE_FROM[completion.status];

    const id = await tryCompleteAttempt(ctx, completion, completableFrom);
    if (id) return { id, duplicate: false };

    // Nothing was written. The attempt as it is now says why.
    const current = await findCompletionState(ctx, completion.id);
    if (!current) throw new LogRecordingError("NOT_FOUND", [{ path: "id", code: "not_found" }]);

    if (current.status !== "sending" && current.completionDigest === completion.completionDigest) {
      return { id: completion.id, duplicate: true };
    }
    // A conflict stays a conflict even when the time it proposed was too early as well.
    if (!completableFrom.some((status) => status === current.status)) {
      throw new LogRecordingError("COMPLETION_CONFLICT");
    }
    if (completion.completedAt && completion.completedAt < current.startedAt) {
      throw new LogRecordingError("INVALID_RECORD", [{ path: "completedAt", code: "before_start" }]);
    }
    // The statement should have written this one. Never assumed recorded, never tried again.
    throw new LogRecordingError("STORAGE_FAILED");
  } catch (error) {
    throw LogRecordingError.from(error);
  }
}
