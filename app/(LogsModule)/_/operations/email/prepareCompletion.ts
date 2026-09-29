import "server-only";

import type { PreparedCompletion } from "@/app/(LogsModule)/_/db/email/completeAttempt";
import { canonicalJson, sha256Hex } from "@/app/(LogsModule)/_/derivation";
import {
  assertNoStructuralSecrets,
  createRedactor,
  truncateDiagnostic,
  truncateDiagnosticChars,
} from "@/app/(LogsModule)/_/redaction";
import {
  LOG_LIMITS,
  assertRawRecordBytes,
  completeEmailLogInputSchema,
  parseRecordInput,
  type CompleteEmailLogInput,
} from "@/app/(LogsModule)/_/schema";
import { LogRecordingError } from "@/app/(LogsModule)/_/types";

/**
 * Turns a reported outcome into the observation that is stored. The raw
 * record is bounded before anything reads it, and diagnostics are redacted
 * before they are cut, so a cut cannot expose part of a token. A diagnostic
 * that was not supplied is null, not absent: it is written as null.
 *
 * The fingerprint covers the log ID and the sanitized observation. The
 * context's actor is deliberately not part of it: the same observation
 * reported by another context is the same observation.
 *
 * Throws `INVALID_RECORD` naming a path and a code, never a value.
 */
export async function prepareCompletion(input: CompleteEmailLogInput): Promise<PreparedCompletion> {
  assertRawRecordBytes(input);
  const { secrets, ...payload } = parseRecordInput(completeEmailLogInputSchema, input);
  if (payload.completedAt && payload.completedAt.getTime() > Date.now() + LOG_LIMITS.clockSkewMs) {
    throw new LogRecordingError("INVALID_RECORD", [{ path: "completedAt", code: "in_future" }]);
  }

  const redactor = createRedactor(secrets);
  // An identifier is never rewritten: a secret in it refuses the record.
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

  const completionDigest = await sha256Hex(canonicalJson({ id: payload.id, ...observation }));
  return { id: payload.id, ...observation, completionDigest };
}
