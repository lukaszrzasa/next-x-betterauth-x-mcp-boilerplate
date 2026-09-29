import type { StaffLogBlockView } from "@/app/(LogsModule)/_/staffLog/schema";
import type { EmailLogStatus } from "@/app/(LogsModule)/_/types";
import type { EmailLogsQuerySchema, LogPageSize, StaffLogsQuerySchema } from "./schema";

/**
 * What crosses the server/client boundary for the log lists. Every shape is
 * an explicit projection with ISO 8601 UTC dates and explicit nulls; rows
 * are never spread, and an email attempt's record key and idempotency
 * digests are never returned.
 */

export type EmailLogsQuery = EmailLogsQuerySchema;
export type StaffLogsQuery = StaffLogsQuerySchema;

/** A stored status or outcome this release does not know is shown as-is, never coerced. */
type Known<T extends string> = T | (string & {});

/** The instants a list was read with: `from` inclusive, `until` exclusive; null is unbounded. */
export type ResolvedRange = { from: string | null; until: string | null };

/** A captured snapshot as read back; `label` is null only when the stored one is unusable. */
export type EntityView = { type: string; id: string; label: string | null };

/** `user` carries an ID; `anonymous` never does. Another kind would come from a newer release. */
export type ActorView = { kind: string; id: string | null; label: string };

// ---------------------------------------------------------------------------
// Email logs
// ---------------------------------------------------------------------------

export type EmailLogListItem = {
  id: string;
  startedAt: string;
  recipientEmail: string;
  recipientUserId: string | null;
  recipientLabel: string | null;
  subject: string;
  status: Known<EmailLogStatus>;
  attemptNumber: number;
  originalLogId: string | null;
  requester: ActorView;
};

export type EmailLogsPage = {
  items: EmailLogListItem[];
  total: number;
  /** 1-based and clamped to the actual final page. */
  page: number;
  pageSize: LogPageSize;
  /** The canonical criteria the page was read with (page already clamped). */
  query: EmailLogsQuery;
  /** The single instant every relative range was measured from. */
  asOf: string;
  range: ResolvedRange;
};

export type EmailAttemptItem = {
  id: string;
  startedAt: string;
  status: Known<EmailLogStatus>;
  attemptNumber: number;
  requester: ActorView;
};

export type EmailLogDetail = EmailLogListItem & {
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  contentText: string;
  provider: string | null;
  providerMessageId: string | null;
  previousAttemptId: string | null;
  requestId: string;
  errorCode: string | null;
  errorMessage: string | null;
  stackTrace: string | null;
  redactionVersion: number;
  /** The whole chain, the initial attempt included, by attempt number. */
  attempts: { items: EmailAttemptItem[]; page: number; pageSize: 20; total: number };
};

// ---------------------------------------------------------------------------
// Staff log
// ---------------------------------------------------------------------------

export type StaffLogItem = {
  id: string;
  createdAt: string;
  /** The staff member as they are named now; the log stores only who, never a name. */
  actor: { id: string; name: string };
  action: string;
  resource: { type: string; id: string };
  message: StaffLogBlockView[];
};

export type StaffLogsPage = {
  items: StaffLogItem[];
  total: number;
  page: number;
  pageSize: LogPageSize;
  query: StaffLogsQuery;
  asOf: string;
  range: ResolvedRange;
};

/** What the list's filters offer: only what the log actually contains. */
export type StaffLogFilterOptions = {
  actors: Array<{ id: string; name: string }>;
  actions: string[];
};

/** Query parameter of the selected record; it opens the dialog and never filters the table. */
export const LOG_SELECTION_PARAM = "log";
