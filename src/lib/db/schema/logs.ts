import { sql } from "drizzle-orm";
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { id } from "./_columns";
import { user } from "./auth";

/**
 * Persistent logs owned by `app/(LogsModule)`: one row per email sending
 * attempt and one row per staff action.
 *
 * An email attempt is an event-time snapshot without foreign keys to other
 * tables; its only references are the retry chain's, to `email_log` itself.
 * Its content columns hold redacted values only and `search_text` is a
 * server-derived metadata document (never bodies, stacks or secrets).
 *
 * A staff log entry points at its resource by type and ID without a foreign
 * key (the logs module does not know other modules' tables) and carries its
 * message as snapshot blocks. Users are the one exception: the acting staff
 * member is a real reference, and accounts are never deleted.
 *
 * Timestamps are `timestamptz` (instants); neither table uses the generic
 * auto-updating `updatedAt`.
 *
 * Hand-written in the migration and unknown to drizzle-kit, so preserve them
 * when regenerating: `CREATE EXTENSION pg_trgm`, the trigger that keeps an
 * email attempt's initiation snapshot immutable (and its status transitions
 * honest), and the triggers that forbid updating or deleting a staff log entry.
 */

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const emailLog = pgTable(
  "email_log",
  {
    ...id,
    /** The caller's stable idempotency key for this attempt. */
    recordKey: varchar("record_key", { length: 200 }).notNull().unique("email_log_record_key_key"),
    /** SHA-256 of the canonical redacted initiation payload. */
    inputDigest: char("input_digest", { length: 64 }).notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    /** When status metadata last changed; set by the completion service. */
    updatedAt: instant("updated_at").notNull().defaultNow(),
    startedAt: instant("started_at").notNull(),
    /** The known terminal observation time; null while `sending`. */
    completedAt: instant("completed_at"),
    /** Normalized lowercase recipient snapshot. */
    recipientEmail: varchar("recipient_email", { length: 254 }).notNull(),
    /** Plain external user ID; deliberately no foreign key. */
    recipientUserId: varchar("recipient_user_id", { length: 128 }),
    recipientLabel: varchar("recipient_label", { length: 200 }),
    subject: varchar("subject", { length: 500 }).notNull(),
    contentText: text("content_text").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("sending"),
    provider: varchar("provider", { length: 64 }),
    providerMessageId: varchar("provider_message_id", { length: 200 }),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    stackTrace: text("stack_trace"),
    /** The chain's initial attempt; null on the initial attempt itself. */
    originalLogId: uuid("original_log_id").references((): AnyPgColumn => emailLog.id, {
      onDelete: "restrict",
    }),
    /** The attempt this one retried; null on the initial attempt. */
    previousAttemptId: uuid("previous_attempt_id").references((): AnyPgColumn => emailLog.id, {
      onDelete: "restrict",
    }),
    attemptNumber: integer("attempt_number").notNull(),
    requesterKind: varchar("requester_kind", { length: 16 }).notNull(),
    /** User ID iff `requester_kind = 'user'`; no foreign key. */
    requesterId: varchar("requester_id", { length: 128 }),
    requesterLabel: varchar("requester_label", { length: 200 }).notNull(),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    redactionVersion: smallint("redaction_version").notNull().default(1),
    /** Fingerprint of the recorded terminal observation, for idempotent completion. */
    completionDigest: char("completion_digest", { length: 64 }),
    searchText: text("search_text").notNull(),
  },
  (table) => [
    check("email_log_status_check", sql`${table.status} IN ('sending', 'accepted', 'failed', 'unknown')`),
    check(
      "email_log_requester_check",
      sql`(${table.requesterKind} = 'user' AND ${table.requesterId} IS NOT NULL AND ${table.requesterId} <> '')
        OR (${table.requesterKind} = 'anonymous' AND ${table.requesterId} IS NULL AND ${table.requesterLabel} = 'Anonymous')`,
    ),
    check(
      "email_log_chain_check",
      sql`(${table.originalLogId} IS NULL AND ${table.previousAttemptId} IS NULL AND ${table.attemptNumber} = 1)
        OR (${table.originalLogId} IS NOT NULL AND ${table.previousAttemptId} IS NOT NULL
          AND ${table.originalLogId} <> ${table.id} AND ${table.previousAttemptId} <> ${table.id}
          AND ${table.attemptNumber} > 1)`,
    ),
    check(
      "email_log_completion_check",
      sql`(${table.status} = 'sending' AND ${table.completedAt} IS NULL AND ${table.completionDigest} IS NULL)
        OR (${table.status} <> 'sending' AND ${table.completedAt} IS NOT NULL
          AND ${table.completedAt} >= ${table.startedAt} AND ${table.completionDigest} IS NOT NULL)`,
    ),
    check(
      "email_log_recipient_email_check",
      sql`${table.recipientEmail} <> '' AND ${table.recipientEmail} = lower(${table.recipientEmail})`,
    ),
    check(
      "email_log_text_check",
      sql`${table.recordKey} <> '' AND ${table.requesterLabel} <> '' AND ${table.requestId} <> ''
        AND ${table.subject} <> '' AND ${table.contentText} <> ''
        AND octet_length(${table.contentText}) <= 131072
        AND (${table.errorMessage} IS NULL OR char_length(${table.errorMessage}) <= 4000)
        AND (${table.stackTrace} IS NULL OR octet_length(${table.stackTrace}) <= 32768)`,
    ),
    check(
      "email_log_digest_check",
      sql`${table.inputDigest} ~ '^[0-9a-f]{64}$'
        AND (${table.completionDigest} IS NULL OR ${table.completionDigest} ~ '^[0-9a-f]{64}$')`,
    ),
    check("email_log_redaction_version_check", sql`${table.redactionVersion} >= 1`),
    index("email_log_started_at_id_idx").on(table.startedAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
    index("email_log_status_started_at_id_idx").on(table.status, table.startedAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
    index("email_log_recipient_user_started_at_id_idx").on(
      table.recipientUserId,
      table.startedAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    index("email_log_recipient_email_started_at_id_idx").on(
      table.recipientEmail,
      table.startedAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    // Retry rows only (the initial attempt has a null original, and NULLs are
    // distinct): one number per chain position, and the chain read's index.
    uniqueIndex("email_log_chain_attempt_idx").on(table.originalLogId, table.attemptNumber),
    index("email_log_search_text_trgm_idx").using("gin", table.searchText.op("gin_trgm_ops")),
  ],
);

export const staffLog = pgTable(
  "staff_log",
  {
    ...id,
    createdAt: instant("created_at").notNull().defaultNow(),
    /** The staff member who acted; their name is read live, never stored. */
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** Stable key of what was done, e.g. `user.banned`; for filtering, never for rendering. */
    action: varchar("action", { length: 150 }).notNull(),
    /** What was acted on; any module's resource, so deliberately no foreign key. */
    resourceType: varchar("resource_type", { length: 64 }).notNull(),
    resourceId: varchar("resource_id", { length: 128 }).notNull(),
    /** Nonempty array of message blocks, each a snapshot taken when the action happened. */
    message: jsonb("message").$type<unknown[]>().notNull(),
    /** The message as plain text, derived from the blocks, for search. */
    messageText: text("message_text").notNull(),
  },
  (table) => [
    check("staff_log_action_check", sql`${table.action} ~ '^[a-z][a-z0-9_.-]{0,149}$'`),
    check("staff_log_resource_check", sql`${table.resourceType} <> '' AND ${table.resourceId} <> ''`),
    check(
      "staff_log_message_check",
      sql`jsonb_typeof(${table.message}) = 'array' AND jsonb_array_length(${table.message}) >= 1
        AND ${table.messageText} <> ''`,
    ),
    index("staff_log_created_at_id_idx").on(table.createdAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
    // An ID alone finds a resource's history; the type only lists a whole kind.
    index("staff_log_resource_id_created_at_id_idx").on(
      table.resourceId,
      table.createdAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    index("staff_log_resource_type_created_at_id_idx").on(
      table.resourceType,
      table.createdAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    index("staff_log_actor_created_at_id_idx").on(table.actorId, table.createdAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
    index("staff_log_action_created_at_id_idx").on(table.action, table.createdAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
    index("staff_log_message_text_trgm_idx").using("gin", table.messageText.op("gin_trgm_ops")),
  ],
);
