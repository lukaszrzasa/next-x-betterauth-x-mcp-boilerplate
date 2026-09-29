import "server-only";

import { utf8ByteLength } from "@/src/lib/text/utf8";
import type { PreparedAttempt } from "@/app/(LogsModule)/_/db/email/insertAttempt";
import {
  actorFromContext,
  canonicalJson,
  deriveEmailSearchText,
  sha256Hex,
} from "@/app/(LogsModule)/_/derivation";
import { assertNoStructuralSecrets, createRedactor } from "@/app/(LogsModule)/_/redaction";
import {
  LOG_LIMITS,
  assertRawRecordBytes,
  beginEmailLogInputSchema,
  parseRecordInput,
  snapshotLabelSchema,
  type BeginEmailLogInput,
} from "@/app/(LogsModule)/_/schema";
import { LogRecordingError, REDACTION_VERSION, type LogContext } from "@/app/(LogsModule)/_/types";

export type PreparedInitiation = {
  attempt: PreparedAttempt;
  /** The attempt this one retries; null for the first attempt of a new chain. */
  previousAttemptId: string | null;
};

/**
 * Turns what the caller passed into what is stored. The order is the
 * contract: the raw record is bounded before anything reads it, redaction
 * comes before validation of what is stored, and the fingerprint and the
 * search document are made from the redacted values only. The declared
 * secrets end here; nothing returned holds them.
 *
 * Throws `INVALID_RECORD` naming a path and a code, never a value.
 */
export async function prepareInitiation(ctx: LogContext, input: BeginEmailLogInput): Promise<PreparedInitiation> {
  assertRawRecordBytes(input);
  const { secrets, ...payload } = parseRecordInput(beginEmailLogInputSchema, input);
  if (payload.startedAt && payload.startedAt.getTime() > Date.now() + LOG_LIMITS.clockSkewMs) {
    throw new LogRecordingError("INVALID_RECORD", [{ path: "startedAt", code: "in_future" }]);
  }

  const redactor = createRedactor(secrets);
  // The requester is the context's, never the input's.
  const requester = actorFromContext(ctx, redactor);
  const requesterId = requester.kind === "user" ? requester.id : null;

  // Identities and keys are never rewritten: a secret in one refuses the record.
  assertNoStructuralSecrets(redactor, [
    ["recordKey", payload.recordKey],
    ["recipientEmail", payload.recipientEmail],
    ["recipientUserId", payload.recipientUserId],
    ["provider", payload.provider],
    ["previousAttemptId", payload.previousAttemptId],
    ["requester.id", requesterId ?? undefined],
  ]);

  // Display fields are rewritten, then have to fit what is stored.
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
  const provider = payload.provider ?? null;
  const previousAttemptId = payload.previousAttemptId ?? null;

  // What the caller meant, sanitized. Not the request ID or the requester's
  // name: the same request retried later, by a renamed account, is the same record.
  const inputDigest = await sha256Hex(
    canonicalJson({
      recordKey: payload.recordKey,
      startedAt: payload.startedAt,
      recipientEmail: payload.recipientEmail,
      recipientUserId,
      recipientLabel,
      subject,
      contentText,
      provider,
      previousAttemptId,
      requester: { kind: requester.kind, id: requesterId },
    }),
  );

  return {
    attempt: {
      recordKey: payload.recordKey,
      inputDigest,
      startedAt: payload.startedAt,
      recipientEmail: payload.recipientEmail,
      recipientUserId,
      recipientLabel,
      subject,
      contentText,
      provider,
      requesterKind: requester.kind,
      requesterId,
      requesterLabel: requester.label,
      requestId: ctx.requestId,
      redactionVersion: REDACTION_VERSION,
      searchText: deriveEmailSearchText({ subject, recipientEmail: payload.recipientEmail, recipientLabel }),
    },
    previousAttemptId,
  };
}
