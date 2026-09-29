import { z, type ZodType } from "zod";
import { utf8ByteLength } from "@/src/lib/text/utf8";
import { EMAIL_COMPLETION_STATUSES, LogRecordingError } from "./types";

/**
 * Write contracts of the email recorders. Strict and bounded: every string has a
 * limit, every object rejects unknown keys, and nothing here echoes a value
 * back in an error (Zod issues carry paths and codes; the recorder converts
 * them to `LogRecordingError` without the input).
 *
 * These are the *write* schemas. Readers decode stored rows with their own
 * tolerant schemas (`admin/_/schema.ts`), because a row written by an older
 * or newer release must still render.
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const LOG_LIMITS = {
  idLength: 128,
  recordKeyLength: 200,
  labelLength: 200,
  errorCodeLength: 100,
  /** Raw subject; the stored, redacted subject must fit `storedSubjectLength`. */
  subjectInputLength: 2_000,
  storedSubjectLength: 500,
  providerMessageIdLength: 200,
  /** Every limit below is in UTF-8 bytes. */
  totalPayloadBytes: 512 * 1024,
  contentTextBytes: 128 * 1024,
  stackInputBytes: 128 * 1024,
  storedStackBytes: 32 * 1024,
  errorMessageInputBytes: 16 * 1024,
  storedErrorMessageLength: 4_000,
  /** How far ahead of the server clock a caller-supplied instant may be. */
  clockSkewMs: 5 * 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const hasNoControlCharacters = (value: string) => !CONTROL_CHARACTERS.test(value);
const fitsBytes = (max: number) => (value: string) => utf8ByteLength(value) <= max;

/** Opaque identifiers: not assumed to be UUIDs, never trimmed or rewritten. */
export const opaqueIdSchema = z
  .string()
  .min(1)
  .max(LOG_LIMITS.idLength)
  .refine(hasNoControlCharacters, { error: "Control characters are not allowed." });

/** One stable key per event (or attempt); visible ASCII, no spaces. */
export const recordKeySchema = z
  .string()
  .regex(/^[\x21-\x7E]{1,200}$/, { error: "Use 1-200 visible ASCII characters." });

/** A display label captured at event time: trimmed, single line, nonempty. */
export const snapshotLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(LOG_LIMITS.labelLength)
  .refine(hasNoControlCharacters, { error: "Control characters are not allowed." });

/**
 * Exact sensitive strings, keyed by what they are (`verificationCode`,
 * `resetUrl`). Required - pass `{}` when there are none - so that omitting
 * it is a type error rather than a silent leak. Held in memory only.
 */
export const secretsSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string()).max(100)]),
);

const instantSchema = z.date();

export const errorCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(LOG_LIMITS.errorCodeLength)
  .refine(hasNoControlCharacters, { error: "Control characters are not allowed." });

export const stackTraceInputSchema = z
  .string()
  .min(1)
  .refine(fitsBytes(LOG_LIMITS.stackInputBytes), { error: "Stack trace is too large." });

export const errorMessageInputSchema = z
  .string()
  .min(1)
  .refine(fitsBytes(LOG_LIMITS.errorMessageInputBytes), { error: "Error message is too large." });

// ---------------------------------------------------------------------------
// Email attempts
// ---------------------------------------------------------------------------

/** Normalized before validation, so padded or mixed-case input is stored lowercase. */
export const recipientEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const providerSchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/);

export const beginEmailLogInputSchema = z.strictObject({
  recordKey: recordKeySchema,
  /** When the attempt started; defaults to the recording time. */
  startedAt: instantSchema.optional(),
  recipientEmail: recipientEmailSchema,
  recipientUserId: opaqueIdSchema.optional(),
  recipientLabel: snapshotLabelSchema.optional(),
  subject: z.string().trim().min(1).max(LOG_LIMITS.subjectInputLength),
  /** Plain text, already rendered by the sender; never HTML or a React node. */
  contentText: z
    .string()
    .min(1)
    .refine(fitsBytes(LOG_LIMITS.contentTextBytes), { error: "Content is too large." }),
  provider: providerSchema.optional(),
  /** The latest attempt of the chain this attempt retries. */
  previousAttemptId: z.uuid().optional(),
  secrets: secretsSchema,
});

export const completeEmailLogInputSchema = z.strictObject({
  id: z.uuid(),
  status: z.enum(EMAIL_COMPLETION_STATUSES),
  /** When the outcome was observed; defaults to the recording time. */
  completedAt: instantSchema.optional(),
  providerMessageId: z
    .string()
    .min(1)
    .max(LOG_LIMITS.providerMessageIdLength)
    .refine(hasNoControlCharacters, { error: "Control characters are not allowed." })
    .optional(),
  errorCode: errorCodeSchema.optional(),
  errorMessage: errorMessageInputSchema.optional(),
  stackTrace: stackTraceInputSchema.optional(),
  secrets: secretsSchema,
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates recorder input without ever echoing it: failures become
 * `INVALID_RECORD` issues holding a path and a Zod issue code only.
 */
export function parseRecordInput<T>(schema: ZodType<T>, input: unknown, pathPrefix = ""): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new LogRecordingError(
    "INVALID_RECORD",
    result.error.issues.slice(0, 20).map((issue) => ({
      path: [pathPrefix, ...issue.path.map(String)].filter(Boolean).join("."),
      code: issue.code,
    })),
  );
}

/**
 * The first check a recorder makes, before any other processing: the whole
 * raw record, declared secrets included, is at most 512 KiB of JSON. A value
 * JSON cannot represent (a cycle, a BigInt) is simply invalid.
 */
export function assertRawRecordBytes(input: unknown): void {
  let json: string | undefined;
  try {
    json = JSON.stringify(input);
  } catch {
    throw new LogRecordingError("INVALID_RECORD", [{ path: "", code: "invalid_type" }]);
  }
  if (utf8ByteLength(json ?? "") > LOG_LIMITS.totalPayloadBytes) {
    throw new LogRecordingError("INVALID_RECORD", [{ path: "", code: "too_big" }]);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The declared sensitive strings, as callers naturally hold them (readonly arrays included). */
export type SecretsInput = Readonly<Record<string, string | readonly string[]>>;

type WithSecrets<T> = Omit<T, "secrets"> & { secrets: SecretsInput };

/** What a caller passes (defaults not yet applied). */
export type BeginEmailLogInput = WithSecrets<z.input<typeof beginEmailLogInputSchema>>;
export type CompleteEmailLogInput = WithSecrets<z.input<typeof completeEmailLogInputSchema>>;

/** What the recorder works with after validation. */
export type BeginEmailLogSchema = z.infer<typeof beginEmailLogInputSchema>;
export type CompleteEmailLogSchema = z.infer<typeof completeEmailLogInputSchema>;
export type SecretsSchema = z.infer<typeof secretsSchema>;
