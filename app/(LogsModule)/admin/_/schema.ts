import { z } from "zod";
import { opaqueIdSchema } from "@/app/(LogsModule)/_/schema";
import {
  staffLogActionSchema,
  staffLogIdSchema,
  staffLogResourceTypeSchema,
} from "@/app/(LogsModule)/_/staffLog/schema";
import { EMAIL_LOG_STATUSES } from "@/app/(LogsModule)/_/types";
import type { ActorView } from "./types";

/**
 * Read contracts of the admin lists and the email dialog. The list schemas
 * are strict: URL normalization happens first in `queryState.ts`, so a
 * direct caller passing an invalid value is refused rather than coerced.
 */

// ---------------------------------------------------------------------------
// Shared list vocabulary
// ---------------------------------------------------------------------------

export const LOG_PAGE_SIZES = [10, 25, 50, 100] as const;
export const LOG_SEARCH_MAX_LENGTH = 200;
export const LOG_MAX_PAGE = 1_000_000;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;

/** Elapsed windows ending at the read instant, all time, or whole UTC days. */
export const LOG_RANGES = ["24h", "7d", "30d", "90d", "all", "custom"] as const;
export const RELATIVE_RANGE_DAYS = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 } as const;

/** Attempts shown per page of an email's retry chain. */
export const EMAIL_ATTEMPTS_PAGE_SIZE = 20;

/**
 * The calendar dates a custom range may use. Bounded so both instants stay
 * inside what PostgreSQL and `toISOString()` agree on: year 0 does not exist
 * in PostgreSQL, and the day after 9999-12-31 has a five-digit year.
 */
export const CALENDAR_DATE_MIN = "1970-01-01";
export const CALENDAR_DATE_MAX = "9998-12-31";

/** A real calendar date, `YYYY-MM-DD`, interpreted in UTC, within the bounds above. */
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().startsWith(value) &&
      value >= CALENDAR_DATE_MIN &&
      value <= CALENDAR_DATE_MAX
    );
  });

const optionalDateSchema = z.union([z.literal(""), calendarDateSchema]);

const rangeShape = {
  range: z.enum(LOG_RANGES),
  from: optionalDateSchema,
  to: optionalDateSchema,
};

/** `custom` needs both dates, in order; every other range carries none. */
function refineRange(value: { range: string; from: string; to: string }, context: z.RefinementCtx) {
  if (value.range === "custom") {
    if (value.from === "" || value.to === "" || value.from > value.to) {
      context.addIssue({ code: "custom", path: ["from"], message: "A custom range needs two ordered dates." });
    }
  } else if (value.from !== "" || value.to !== "") {
    context.addIssue({ code: "custom", path: ["from"], message: "Dates apply to a custom range only." });
  }
}

const listShape = {
  q: z
    .string()
    .trim()
    .max(LOG_SEARCH_MAX_LENGTH)
    .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), { error: "Control characters are not allowed." }),
  ...rangeShape,
  direction: z.enum(SORT_DIRECTIONS),
  page: z.int().min(1).max(LOG_MAX_PAGE),
  pageSize: z.literal(LOG_PAGE_SIZES),
};

const exactIdFilter = z.union([z.literal(""), opaqueIdSchema]);

// ---------------------------------------------------------------------------
// Email logs
// ---------------------------------------------------------------------------

export const EMAIL_STATUS_FILTERS = ["all", ...EMAIL_LOG_STATUSES] as const;
export const EMAIL_LOG_SORTS = ["time", "recipient", "subject"] as const;

export const emailLogsQuerySchema = z
  .strictObject({
    ...listShape,
    status: z.enum(EMAIL_STATUS_FILTERS),
    /** Exact normalized recipient address. */
    recipient: z.union([z.literal(""), z.email().max(254).refine((value) => value === value.toLowerCase())]),
    /** Exact recipient user ID. */
    userId: exactIdFilter,
    sort: z.enum(EMAIL_LOG_SORTS),
  })
  .superRefine(refineRange);

export const emailLogDetailSchema = z.strictObject({
  id: z.uuid(),
  /** 1-based page of the attempt chain; independent of the list's page. */
  attemptsPage: z.int().min(1).max(LOG_MAX_PAGE).default(1),
});

// ---------------------------------------------------------------------------
// Staff log
// ---------------------------------------------------------------------------

/** How many actions one read may filter by (a widget showing a family of actions). */
export const STAFF_LOG_MAX_ACTIONS = 20;

export const staffLogsQuerySchema = z
  .strictObject({
    q: listShape.q,
    ...rangeShape,
    page: listShape.page,
    pageSize: listShape.pageSize,
    /** The staff member who acted. */
    actorId: z.union([z.literal(""), staffLogIdSchema]),
    /** Any of these actions; empty is every action. */
    actions: z.array(staffLogActionSchema).max(STAFF_LOG_MAX_ACTIONS),
    /** Lists a whole kind of resource; an ID never needs it. */
    resourceType: z.union([z.literal(""), staffLogResourceTypeSchema]),
    resourceId: z.union([z.literal(""), staffLogIdSchema]),
  })
  .superRefine(refineRange);

/** Columns of an actor/requester snapshot, projected as stored. */
export function toActorView(kind: string, id: string | null, label: string): ActorView {
  return { kind, id: kind === "anonymous" ? null : id, label };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmailLogsQuerySchema = z.infer<typeof emailLogsQuerySchema>;
export type EmailLogDetailSchema = z.infer<typeof emailLogDetailSchema>;
export type StaffLogsQuerySchema = z.infer<typeof staffLogsQuerySchema>;
export type LogRange = (typeof LOG_RANGES)[number];
export type LogPageSize = (typeof LOG_PAGE_SIZES)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export type EmailStatusFilter = (typeof EMAIL_STATUS_FILTERS)[number];
export type EmailLogSort = (typeof EMAIL_LOG_SORTS)[number];
