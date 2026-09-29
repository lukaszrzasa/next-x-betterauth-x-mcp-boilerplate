import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";

/**
 * Value contracts of the email log: event-time snapshots and what its
 * recorders return. Everything stored is a copy made at recording time. The
 * staff log's contracts are in `staffLog/`.
 */

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/** One row per sending attempt: `sending` until a terminal observation is recorded. */
export const EMAIL_LOG_STATUSES = ["sending", "accepted", "failed", "unknown"] as const;
export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number];

/**
 * What a completion may report. `accepted` is the provider's acceptance, not
 * delivery to an inbox; `unknown` is an honest "we could not tell" (a timeout
 * after the request left) and may later be resolved once to accepted/failed.
 */
export const EMAIL_COMPLETION_STATUSES = ["accepted", "failed", "unknown"] as const;
export type EmailCompletionStatus = (typeof EMAIL_COMPLETION_STATUSES)[number];

/**
 * Who requested an email, derived from the recording context and never from
 * input. There is deliberately no `system` kind: no independent background
 * principal exists yet. When one does, add its kind here and to the
 * `requester_kind` check (a migration), derive it from its own trusted
 * context in `actorFromContext`, and give it a rendering in the admin
 * dialog - never reuse `anonymous` or a fabricated user for it.
 */
export const ACTOR_KINDS = ["user", "anonymous"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

/** The fixed label of an anonymous actor; it has no ID. */
export const ANONYMOUS_ACTOR_LABEL = "Anonymous";

/** Version of the redaction policy in `redaction.ts` applied before persistence. */
export const REDACTION_VERSION = 1;

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export type ActorSnapshot =
  | { kind: "user"; id: string; label: string }
  | { kind: "anonymous"; label: typeof ANONYMOUS_ACTOR_LABEL };

export type Scalar = string | number | boolean | null;

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/** A recorder runs inside a trusted operation that already holds a genuine context. */
export type LogContext = AuthedCtx | PublicCtx;

/** `duplicate` is true when an identical record with the same key already existed. */
export type RecordResult = { id: string; duplicate: boolean };

export const LOG_RECORDING_ERROR_CODES = [
  /** The input failed validation, or a declared secret appeared in a structural field. */
  "INVALID_RECORD",
  /** The record key already names a record with a different payload or owner. */
  "RECORD_KEY_CONFLICT",
  /** The email log (or retry predecessor) does not exist. */
  "NOT_FOUND",
  /** A retry named a predecessor that is no longer the latest attempt of its chain. */
  "STALE_PREDECESSOR",
  /** A retry changed the recipient; a different recipient is a new message chain. */
  "RECIPIENT_MISMATCH",
  /** A different terminal observation was already recorded for this attempt. */
  "COMPLETION_CONFLICT",
  /** The database refused or failed the write. */
  "STORAGE_FAILED",
] as const;
export type LogRecordingErrorCode = (typeof LOG_RECORDING_ERROR_CODES)[number];

/** Where validation failed: a path and a short machine code, never the offending value. */
export type LogRecordingIssue = { path: string; code: string };

/**
 * The only error a recorder throws. Its message is fixed per code and it
 * never carries a `cause`: the action builder logs whole cause chains, and a
 * driver error would otherwise put SQL parameters (redacted content, record
 * keys) into the application log. Validation issues name paths, not values.
 */
export class LogRecordingError extends Error {
  readonly code: LogRecordingErrorCode;
  readonly issues: readonly LogRecordingIssue[];

  constructor(code: LogRecordingErrorCode, issues: readonly LogRecordingIssue[] = []) {
    super(LOG_RECORDING_ERROR_MESSAGES[code]);
    this.name = "LogRecordingError";
    this.code = code;
    this.issues = issues;
  }

  static is(value: unknown): value is LogRecordingError {
    return value instanceof LogRecordingError;
  }

  /**
   * Any failure of a recorder as a `LogRecordingError`: its own errors pass
   * through; anything else (a driver error, an unexpected exception) becomes
   * `STORAGE_FAILED` keeping only the SQLSTATE and constraint name, which
   * identify the failure without repeating a single value.
   */
  static from(error: unknown): LogRecordingError {
    if (LogRecordingError.is(error)) return error;
    const issues: LogRecordingIssue[] = [];
    for (let current = error, depth = 0; current && depth < 3; depth += 1) {
      const { code, constraint } = current as { code?: unknown; constraint?: unknown };
      if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
        issues.push({ path: "database", code });
        if (typeof constraint === "string" && /^[a-z0-9_]{1,63}$/.test(constraint)) {
          issues.push({ path: "constraint", code: constraint });
        }
        break;
      }
      current = (current as { cause?: unknown }).cause;
    }
    return new LogRecordingError("STORAGE_FAILED", issues);
  }
}

const LOG_RECORDING_ERROR_MESSAGES: Record<LogRecordingErrorCode, string> = {
  INVALID_RECORD: "The log record is invalid.",
  RECORD_KEY_CONFLICT: "The record key is already used by a different log record.",
  NOT_FOUND: "The referenced email log does not exist.",
  STALE_PREDECESSOR: "The previous attempt is no longer the latest attempt of its chain.",
  RECIPIENT_MISMATCH: "A retry must keep the recipient of its original attempt.",
  COMPLETION_CONFLICT: "A different completion was already recorded for this attempt.",
  STORAGE_FAILED: "The log record could not be stored.",
};
