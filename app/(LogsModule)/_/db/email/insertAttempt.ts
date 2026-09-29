import "server-only";

import { sql } from "drizzle-orm";

import { db, emailLog } from "@/src/lib/db";
import type { ActorKind, LogContext } from "@/app/(LogsModule)/_/types";

/**
 * The initiation snapshot of an attempt, ready to store: validated,
 * redacted and fingerprinted by the operation. It has no field for a
 * declared secret or for raw input.
 */
export type PreparedAttempt = {
  recordKey: string;
  /** SHA-256 of the canonical sanitized payload. */
  inputDigest: string;
  /** When the caller says the attempt started; absent means the recording time. */
  startedAt?: Date;
  recipientEmail: string;
  recipientUserId: string | null;
  recipientLabel: string | null;
  subject: string;
  contentText: string;
  provider: string | null;
  requesterKind: ActorKind;
  requesterId: string | null;
  requesterLabel: string;
  requestId: string;
  redactionVersion: number;
  searchText: string;
};

/** Where a retry sits in its chain. An initial attempt has no position: it is attempt 1 of its own chain. */
export type ChainPosition = {
  attemptNumber: number;
  originalLogId: string;
  previousAttemptId: string;
};

export type AttemptWriter = Pick<typeof db, "insert">;

/**
 * Inserts the attempt as `sending`. The unique record key arbitrates: the
 * new row's ID, or `null` when the key already names a row and nothing was
 * written.
 */
export async function insertAttemptWith(
  writer: AttemptWriter,
  attempt: PreparedAttempt,
  position: ChainPosition | null,
): Promise<string | null> {
  const [inserted] = await writer
    .insert(emailLog)
    .values({
      recordKey: attempt.recordKey,
      inputDigest: attempt.inputDigest,
      startedAt: attempt.startedAt ?? sql`now()`,
      recipientEmail: attempt.recipientEmail,
      recipientUserId: attempt.recipientUserId,
      recipientLabel: attempt.recipientLabel,
      subject: attempt.subject,
      contentText: attempt.contentText,
      status: "sending",
      provider: attempt.provider,
      requesterKind: attempt.requesterKind,
      requesterId: attempt.requesterId,
      requesterLabel: attempt.requesterLabel,
      requestId: attempt.requestId,
      redactionVersion: attempt.redactionVersion,
      searchText: attempt.searchText,
      attemptNumber: position?.attemptNumber ?? 1,
      originalLogId: position?.originalLogId ?? null,
      previousAttemptId: position?.previousAttemptId ?? null,
    })
    .onConflictDoNothing({ target: emailLog.recordKey })
    .returning({ id: emailLog.id });
  return inserted?.id ?? null;
}

/** The first attempt of a new chain: one statement, no transaction and no lookup before it. */
export function insertInitialAttempt(_ctx: LogContext, attempt: PreparedAttempt): Promise<string | null> {
  return insertAttemptWith(db, attempt, null);
}
