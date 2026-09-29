import "server-only";

import { and, eq, inArray, lte, sql } from "drizzle-orm";

import { db, emailLog } from "@/src/lib/db";
import type { EmailCompletionStatus, EmailLogStatus, LogContext } from "@/app/(LogsModule)/_/types";

/** A terminal observation, ready to store: validated, redacted and fingerprinted by the operation. */
export type PreparedCompletion = {
  id: string;
  status: EmailCompletionStatus;
  /** When the outcome was observed; absent means the recording time. */
  completedAt?: Date;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  stackTrace: string | null;
  /** SHA-256 of the canonical sanitized observation. */
  completionDigest: string;
};

/**
 * Records the observation in one conditional statement: the `WHERE` clause
 * is the precondition the operation asked for, evaluated against the row as
 * it is when the statement reaches it. Two completions of one attempt
 * contend on the row inside PostgreSQL, and the one that arrives second is
 * checked against what the first one committed. Returns the ID, or `null`
 * when nothing was written: no such attempt, a status outside
 * `completableFrom`, or an observed time before the attempt's start.
 *
 * Only the observation columns are set. The diagnostics are written exactly
 * as given, nulls included, so resolving `unknown` clears the diagnostics
 * of the timeout it replaces. A provider message ID that is not supplied
 * keeps the one stored with `unknown`, read from the row being updated.
 */
export async function tryCompleteAttempt(
  _ctx: LogContext,
  completion: PreparedCompletion,
  completableFrom: readonly EmailLogStatus[],
): Promise<string | null> {
  const [completed] = await db
    .update(emailLog)
    .set({
      status: completion.status,
      // Without an observed time, the recording time - never earlier than the start.
      completedAt: completion.completedAt ?? sql`greatest(now(), ${emailLog.startedAt})`,
      providerMessageId:
        completion.providerMessageId ??
        sql`CASE WHEN ${emailLog.status} = 'unknown' THEN ${emailLog.providerMessageId} ELSE NULL END`,
      errorCode: completion.errorCode,
      errorMessage: completion.errorMessage,
      stackTrace: completion.stackTrace,
      completionDigest: completion.completionDigest,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(emailLog.id, completion.id),
        inArray(emailLog.status, [...completableFrom]),
        completion.completedAt ? lte(emailLog.startedAt, completion.completedAt) : undefined,
      ),
    )
    .returning({ id: emailLog.id });
  return completed?.id ?? null;
}
