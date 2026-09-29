import "server-only";

import { desc, eq, or, sql } from "drizzle-orm";

import { db, emailLog } from "@/src/lib/db";
import { utf8ByteLength } from "@/src/lib/text/utf8";
import {
  actorFromContext,
  canonicalJson,
  deriveEmailSearchText,
  sha256Hex,
} from "@/app/(LogsModule)/_/derivation";
import {
  assertNoStructuralSecrets,
  createRedactor,
  truncateDiagnostic,
  truncateDiagnosticChars,
} from "@/app/(LogsModule)/_/redaction";
import {
  LOG_LIMITS,
  assertRawRecordBytes,
  beginEmailLogInputSchema,
  completeEmailLogInputSchema,
  parseRecordInput,
  snapshotLabelSchema,
  type BeginEmailLogInput,
  type CompleteEmailLogInput,
} from "@/app/(LogsModule)/_/schema";
import {
  LogRecordingError,
  REDACTION_VERSION,
  type EmailLogStatus,
  type LogContext,
  type RecordResult,
} from "@/app/(LogsModule)/_/types";

/**
 * Recording of email sending attempts. One row per attempt: `beginEmailLog`
 * stores the redacted initiation snapshot (status `sending`) before the
 * sender tries to deliver, `completeEmailLog` records what was observed
 * afterwards. Nothing here sends, resends or reconstructs an email.
 *
 * The initiation snapshot never changes after insertion (the database
 * enforces it); only the status/observation columns do. Retries are new rows
 * in the same chain, linked to the initial attempt and to the attempt they
 * retried, entirely within `email_log`.
 *
 * Internal and server-only, like the audit recorder: called by a trusted
 * operation with its genuine context, never exposed as an action or endpoint.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

/**
 * Records that a sending attempt starts. Idempotent on `recordKey`: the same
 * sanitized payload from the same requester returns the original ID with
 * `duplicate: true`; anything else under that key is `RECORD_KEY_CONFLICT`.
 *
 * With `previousAttemptId` the attempt is a retry: the predecessor must be
 * the latest attempt of its chain (`STALE_PREDECESSOR` otherwise) and the
 * recipient must be the chain's (`RECIPIENT_MISMATCH`); the attempt number
 * and the chain's original are allocated here under a lock on the original,
 * so competing retries serialize. Subject and body may differ between
 * attempts: a resend regenerates its tokens.
 */
export async function beginEmailLog(ctx: LogContext, input: BeginEmailLogInput): Promise<RecordResult> {
  try {
    assertRawRecordBytes(input);
    const parsed = parseRecordInput(beginEmailLogInputSchema, input);
    const { secrets, ...payload } = parsed;
    if (payload.startedAt && payload.startedAt.getTime() > Date.now() + LOG_LIMITS.clockSkewMs) {
      throw new LogRecordingError("INVALID_RECORD", [{ path: "startedAt", code: "in_future" }]);
    }

    const redactor = createRedactor(secrets);
    const requester = actorFromContext(ctx, redactor);
    assertNoStructuralSecrets(redactor, [
      ["recordKey", payload.recordKey],
      ["recipientEmail", payload.recipientEmail],
      ["recipientUserId", payload.recipientUserId],
      ["provider", payload.provider],
      ["previousAttemptId", payload.previousAttemptId],
      ["requester.id", requester.kind === "user" ? requester.id : undefined],
    ]);

    const subject = redactor.text(payload.subject).trim();
    if (subject.length === 0 || subject.length > LOG_LIMITS.storedSubjectLength) {
      throw new LogRecordingError("INVALID_RECORD", [{ path: "subject", code: "too_big" }]);
    }
    const contentText = redactor.text(payload.contentText);
    if (utf8ByteLength(contentText) > LOG_LIMITS.contentTextBytes) {
      throw new LogRecordingError("INVALID_RECORD", [{ path: "contentText", code: "too_big" }]);
    }
    const recipientLabel =
      payload.recipientLabel === undefined
        ? null
        : parseRecordInput(snapshotLabelSchema, redactor.text(payload.recipientLabel), "recipientLabel");

    const recipientUserId = payload.recipientUserId ?? null;
    const previousAttemptId = payload.previousAttemptId ?? null;
    const inputDigest = await sha256Hex(
      canonicalJson({
        recordKey: payload.recordKey,
        startedAt: payload.startedAt,
        recipientEmail: payload.recipientEmail,
        recipientUserId,
        recipientLabel,
        subject,
        contentText,
        provider: payload.provider ?? null,
        previousAttemptId,
        requester: { kind: requester.kind, id: requester.kind === "user" ? requester.id : null },
      }),
    );

    const row = {
      recordKey: payload.recordKey,
      inputDigest,
      startedAt: payload.startedAt ?? sql`now()`,
      recipientEmail: payload.recipientEmail,
      recipientUserId,
      recipientLabel,
      subject,
      contentText,
      status: "sending",
      provider: payload.provider ?? null,
      requesterKind: requester.kind,
      requesterId: requester.kind === "user" ? requester.id : null,
      requesterLabel: requester.label,
      requestId: ctx.requestId,
      redactionVersion: REDACTION_VERSION,
      searchText: deriveEmailSearchText({ subject, recipientEmail: payload.recipientEmail, recipientLabel }),
    } as const;

    if (previousAttemptId === null) {
      const [inserted] = await db
        .insert(emailLog)
        .values({ ...row, attemptNumber: 1, originalLogId: null, previousAttemptId: null })
        .onConflictDoNothing({ target: emailLog.recordKey })
        .returning({ id: emailLog.id });
      return inserted ? { id: inserted.id, duplicate: false } : await resolveExistingKey(db, payload.recordKey, inputDigest);
    }

    return await db.transaction(async (tx) => {
      // A retry of this very request is answered before the chain is checked:
      // its predecessor is, by now, no longer the latest attempt.
      const known = await findByKey(tx, payload.recordKey);
      if (known) return compareDigest(known, inputDigest);

      const [predecessor] = await tx
        .select({ id: emailLog.id, originalLogId: emailLog.originalLogId })
        .from(emailLog)
        .where(eq(emailLog.id, previousAttemptId))
        .limit(1);
      if (!predecessor) throw new LogRecordingError("NOT_FOUND", [{ path: "previousAttemptId", code: "not_found" }]);
      const originalId = predecessor.originalLogId ?? predecessor.id;

      // Serializes every retry of this chain.
      const [original] = await tx
        .select({ recipientEmail: emailLog.recipientEmail, recipientUserId: emailLog.recipientUserId })
        .from(emailLog)
        .where(eq(emailLog.id, originalId))
        .for("update");
      if (!original) throw new LogRecordingError("NOT_FOUND", [{ path: "previousAttemptId", code: "not_found" }]);

      // Another request may have recorded this key while this one waited.
      const recorded = await findByKey(tx, payload.recordKey);
      if (recorded) return compareDigest(recorded, inputDigest);

      const [latest] = await tx
        .select({ id: emailLog.id, attemptNumber: emailLog.attemptNumber })
        .from(emailLog)
        .where(or(eq(emailLog.id, originalId), eq(emailLog.originalLogId, originalId)))
        .orderBy(desc(emailLog.attemptNumber))
        .limit(1);
      if (!latest || latest.id !== previousAttemptId) throw new LogRecordingError("STALE_PREDECESSOR");
      if (original.recipientEmail !== payload.recipientEmail || original.recipientUserId !== recipientUserId) {
        throw new LogRecordingError("RECIPIENT_MISMATCH");
      }

      const [inserted] = await tx
        .insert(emailLog)
        .values({
          ...row,
          attemptNumber: latest.attemptNumber + 1,
          originalLogId: originalId,
          previousAttemptId,
        })
        .onConflictDoNothing({ target: emailLog.recordKey })
        .returning({ id: emailLog.id });
      return inserted ? { id: inserted.id, duplicate: false } : await resolveExistingKey(tx, payload.recordKey, inputDigest);
    });
  } catch (error) {
    throw LogRecordingError.from(error);
  }
}

/**
 * Records the observed outcome of an attempt: `accepted` (the provider took
 * it - not delivered), `failed`, or `unknown`.
 *
 * - From `sending`, any of the three is recorded.
 * - The identical observation again returns `duplicate: true`.
 * - `unknown` may be resolved once to `accepted` or `failed`; the resolution
 *   replaces the diagnostics with exactly what the resolving caller supplies
 *   (an old timeout is not kept as if it were the failure's cause) and
 *   keeps a provider message ID it does not replace.
 * - Anything else is `COMPLETION_CONFLICT`: history is never overwritten.
 *
 * A row left in `sending` is never converted by this module; the dialog
 * shows that no completion was recorded.
 */
export async function completeEmailLog(
  _ctx: LogContext,
  input: CompleteEmailLogInput,
): Promise<RecordResult> {
  try {
    assertRawRecordBytes(input);
    const parsed = parseRecordInput(completeEmailLogInputSchema, input);
    const { secrets, ...payload } = parsed;
    if (payload.completedAt && payload.completedAt.getTime() > Date.now() + LOG_LIMITS.clockSkewMs) {
      throw new LogRecordingError("INVALID_RECORD", [{ path: "completedAt", code: "in_future" }]);
    }

    const redactor = createRedactor(secrets);
    assertNoStructuralSecrets(redactor, [["providerMessageId", payload.providerMessageId]]);
    const observation = {
      status: payload.status,
      completedAt: payload.completedAt,
      providerMessageId: payload.providerMessageId ?? null,
      errorCode: payload.errorCode ? redactor.text(payload.errorCode) : null,
      errorMessage: payload.errorMessage
        ? truncateDiagnosticChars(redactor.text(payload.errorMessage), LOG_LIMITS.storedErrorMessageLength)
        : null,
      stackTrace: payload.stackTrace
        ? truncateDiagnostic(redactor.text(payload.stackTrace), LOG_LIMITS.storedStackBytes)
        : null,
    };
    if (observation.errorCode !== null && observation.errorCode.length > LOG_LIMITS.errorCodeLength) {
      throw new LogRecordingError("INVALID_RECORD", [{ path: "errorCode", code: "too_big" }]);
    }
    // The context's actor is deliberately not part of an observation.
    const completionDigest = await sha256Hex(canonicalJson({ id: payload.id, ...observation }));

    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          status: emailLog.status,
          startedAt: emailLog.startedAt,
          providerMessageId: emailLog.providerMessageId,
          completionDigest: emailLog.completionDigest,
        })
        .from(emailLog)
        .where(eq(emailLog.id, payload.id))
        .for("update");
      if (!current) throw new LogRecordingError("NOT_FOUND", [{ path: "id", code: "not_found" }]);

      const status = current.status as EmailLogStatus;
      if (status !== "sending" && current.completionDigest === completionDigest) {
        return { id: payload.id, duplicate: true };
      }
      const resolvesUnknown = status === "unknown" && payload.status !== "unknown";
      if (status !== "sending" && !resolvesUnknown) throw new LogRecordingError("COMPLETION_CONFLICT");
      if (observation.completedAt && observation.completedAt < current.startedAt) {
        throw new LogRecordingError("INVALID_RECORD", [{ path: "completedAt", code: "before_start" }]);
      }

      await tx
        .update(emailLog)
        .set({
          status: payload.status,
          // Without an observed time, the recording time - never earlier than the start.
          completedAt: observation.completedAt ?? sql`greatest(now(), ${emailLog.startedAt})`,
          providerMessageId: observation.providerMessageId ?? (resolvesUnknown ? current.providerMessageId : null),
          errorCode: observation.errorCode,
          errorMessage: observation.errorMessage,
          stackTrace: observation.stackTrace,
          completionDigest,
          updatedAt: sql`now()`,
        })
        .where(eq(emailLog.id, payload.id));
      return { id: payload.id, duplicate: false };
    });
  } catch (error) {
    throw LogRecordingError.from(error);
  }
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

type KeyedRow = { id: string; inputDigest: string };

async function findByKey(reader: Reader | Transaction, recordKey: string): Promise<KeyedRow | undefined> {
  const [row] = await reader
    .select({ id: emailLog.id, inputDigest: emailLog.inputDigest })
    .from(emailLog)
    .where(eq(emailLog.recordKey, recordKey))
    .limit(1);
  return row;
}

function compareDigest(row: KeyedRow, inputDigest: string): RecordResult {
  if (row.inputDigest === inputDigest) return { id: row.id, duplicate: true };
  throw new LogRecordingError("RECORD_KEY_CONFLICT");
}

/** After `ON CONFLICT DO NOTHING` the key's row is committed and visible to the next statement. */
async function resolveExistingKey(
  reader: Reader | Transaction,
  recordKey: string,
  inputDigest: string,
): Promise<RecordResult> {
  const row = await findByKey(reader, recordKey);
  if (!row) throw new LogRecordingError("STORAGE_FAILED");
  return compareDigest(row, inputDigest);
}
