import { z } from "zod";
import {
  lastPage,
  parseEnum,
  parseOneOf,
  parsePositiveInt,
  parseText,
  readSingle,
  serializeParams,
  type RawSearchParams,
  type SerializableParam,
} from "@/src/lib/data-table/queryState";
import { logsRoutes } from "@/app/(LogsModule)/_/routes";
import { opaqueIdSchema } from "@/app/(LogsModule)/_/schema";
import { staffLogActionSchema, staffLogIdSchema } from "@/app/(LogsModule)/_/staffLog/schema";
import {
  EMAIL_LOG_SORTS,
  EMAIL_STATUS_FILTERS,
  LOG_MAX_PAGE,
  LOG_PAGE_SIZES,
  LOG_RANGES,
  LOG_SEARCH_MAX_LENGTH,
  RELATIVE_RANGE_DAYS,
  SORT_DIRECTIONS,
  calendarDateSchema,
  type LogRange,
} from "./schema";
import {
  LOG_SELECTION_PARAM,
  type EmailLogListItem,
  type EmailLogsQuery,
  type ResolvedRange,
  type StaffLogsQuery,
} from "./types";

/**
 * URL codecs of the log lists: parameter names, defaults and reset
 * rules. Parsing is forgiving (unsupported or repeated values fall back to
 * their default, unknown keys are dropped, an incomplete or reversed custom
 * range falls back to 30 days, an invalid `log` is removed); serialization is
 * canonical (table order, defaults omitted, `log` last), so a URL round-trips
 * to itself. Pure and isomorphic: the page and the browser share it.
 */

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

type RangeState = { range: LogRange; from: string; to: string };

const DEFAULT_RANGE: RangeState = { range: "30d", from: "", to: "" };

const isCalendarDate = (value: string | undefined): value is string =>
  value !== undefined && calendarDateSchema.safeParse(value).success;

function parseRange(raw: RawSearchParams): RangeState {
  const range = parseEnum(readSingle(raw, "range"), LOG_RANGES, DEFAULT_RANGE.range);
  if (range !== "custom") return { range, from: "", to: "" };
  const from = readSingle(raw, "from");
  const to = readSingle(raw, "to");
  return isCalendarDate(from) && isCalendarDate(to) && from <= to ? { range, from, to } : DEFAULT_RANGE;
}

function rangeParams(query: RangeState): SerializableParam[] {
  return [
    { key: "range", value: query.range, default: DEFAULT_RANGE.range },
    { key: "from", value: query.from, default: "" },
    { key: "to", value: query.to, default: "" },
  ];
}

/** Trimmed and validated with `schema`, or "" (the "no filter" default). */
function parseExact(value: string | undefined, schema: z.ZodType<string>, max: number): string {
  const text = parseText(value, max + 1);
  if (text === "" || text.length > max) return "";
  const parsed = schema.safeParse(text);
  return parsed.success ? parsed.data : "";
}

const recipientFilterSchema = z.email().max(254);

/** A valid UUID (normalized to lowercase), or null. */
export function parseLogSelection(raw: RawSearchParams): string | null {
  const value = readSingle(raw, LOG_SELECTION_PARAM)?.trim().toLowerCase();
  return value && z.uuid().safeParse(value).success ? value : null;
}

const selectionParam = (log: string | null): SerializableParam => ({
  key: LOG_SELECTION_PARAM,
  value: log ?? "",
  default: "",
});

const DAY_MS = 86_400_000;

/**
 * The instants a range covers, measured once from `asOf`: relative ranges
 * are elapsed days ending at `asOf`; a custom range spans whole UTC days,
 * `to` included (the bound is the next day's start, exclusive). `until` is
 * exclusive in every case; a relative range ends one millisecond after
 * `asOf` so rows stamped at `asOf` are inside it.
 */
export function resolveTimeRange(
  query: RangeState,
  asOf: Date,
): { from: Date | null; until: Date | null } {
  switch (query.range) {
    case "all":
      return { from: null, until: null };
    case "custom":
      return {
        from: new Date(`${query.from}T00:00:00.000Z`),
        until: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + DAY_MS),
      };
    default:
      return {
        from: new Date(asOf.getTime() - RELATIVE_RANGE_DAYS[query.range] * DAY_MS),
        until: new Date(asOf.getTime() + 1),
      };
  }
}

/** Pages past the end fold onto the last page; an empty result is page 1. */
export function clampPage<Q extends { page: number; pageSize: number }>(query: Q, total: number): Q {
  const page = Math.min(query.page, lastPage(total, query.pageSize));
  return page === query.page ? query : { ...query, page };
}

// ---------------------------------------------------------------------------
// Email logs
// ---------------------------------------------------------------------------

export const EMAIL_LOGS_QUERY_DEFAULTS: EmailLogsQuery = {
  q: "",
  ...DEFAULT_RANGE,
  status: "all",
  recipient: "",
  userId: "",
  sort: "time",
  direction: "desc",
  page: 1,
  pageSize: 25,
};

export function parseEmailLogsSearch(raw: RawSearchParams): { query: EmailLogsQuery; log: string | null } {
  const single = (key: string) => readSingle(raw, key);
  const defaults = EMAIL_LOGS_QUERY_DEFAULTS;
  return {
    query: {
      q: parseText(single("q"), LOG_SEARCH_MAX_LENGTH),
      ...parseRange(raw),
      status: parseEnum(single("status"), EMAIL_STATUS_FILTERS, defaults.status),
      recipient: parseExact(single("recipient")?.toLowerCase(), recipientFilterSchema, 254),
      userId: parseExact(single("userId"), opaqueIdSchema, 128),
      sort: parseEnum(single("sort"), EMAIL_LOG_SORTS, defaults.sort),
      direction: parseEnum(single("direction"), SORT_DIRECTIONS, defaults.direction),
      page: parsePositiveInt(single("page"), LOG_MAX_PAGE, defaults.page),
      pageSize: parseOneOf(single("pageSize"), LOG_PAGE_SIZES, defaults.pageSize),
    },
    log: parseLogSelection(raw),
  };
}

/** The query string ("" when everything is default), never the pathname. */
export function serializeEmailLogsSearch(query: EmailLogsQuery, log: string | null = null): string {
  const defaults = EMAIL_LOGS_QUERY_DEFAULTS;
  return serializeParams([
    { key: "q", value: query.q, default: defaults.q },
    ...rangeParams(query),
    { key: "status", value: query.status, default: defaults.status },
    { key: "recipient", value: query.recipient, default: defaults.recipient },
    { key: "userId", value: query.userId, default: defaults.userId },
    { key: "sort", value: query.sort, default: defaults.sort },
    { key: "direction", value: query.direction, default: defaults.direction },
    { key: "page", value: query.page, default: defaults.page },
    { key: "pageSize", value: query.pageSize, default: defaults.pageSize },
    selectionParam(log),
  ]);
}

export function emailLogsUrl(query: EmailLogsQuery = EMAIL_LOGS_QUERY_DEFAULTS, log: string | null = null): string {
  return `${logsRoutes.emailLogs.href}${serializeEmailLogsSearch(query, log)}`;
}

/** A filter, sort or page-size change starts again from the first page. */
export function withEmailLogsQueryChange(
  query: EmailLogsQuery,
  change: Partial<Omit<EmailLogsQuery, "page">>,
): EmailLogsQuery {
  return { ...query, ...change, page: 1 };
}

/** Clear filters keeps the sort and page size; everything else returns to default. */
export function clearEmailLogsFilters(query: EmailLogsQuery): EmailLogsQuery {
  return { ...EMAIL_LOGS_QUERY_DEFAULTS, sort: query.sort, direction: query.direction, pageSize: query.pageSize };
}

export function hasEmailLogsFilters(query: EmailLogsQuery): boolean {
  const defaults = EMAIL_LOGS_QUERY_DEFAULTS;
  return (
    query.q !== defaults.q ||
    query.range !== defaults.range ||
    query.status !== defaults.status ||
    query.recipient !== defaults.recipient ||
    query.userId !== defaults.userId
  );
}

// ---------------------------------------------------------------------------
// Staff log
// ---------------------------------------------------------------------------

export const STAFF_LOGS_QUERY_DEFAULTS: StaffLogsQuery = {
  q: "",
  ...DEFAULT_RANGE,
  actorId: "",
  actions: [],
  resourceType: "",
  resourceId: "",
  page: 1,
  pageSize: 25,
};

/**
 * The list's URL: `actor` and `action` are its two visible filters;
 * `resourceId` has no control and arrives from a link ("everything done to
 * this resource"). One action per URL; several are for embedding code.
 */
export function parseStaffLogsSearch(raw: RawSearchParams): StaffLogsQuery {
  const single = (key: string) => readSingle(raw, key);
  const defaults = STAFF_LOGS_QUERY_DEFAULTS;
  const action = parseExact(single("action"), staffLogActionSchema, 150);
  return {
    q: parseText(single("q"), LOG_SEARCH_MAX_LENGTH),
    ...parseRange(raw),
    actorId: parseExact(single("actor"), staffLogIdSchema, 128),
    actions: action ? [action] : [],
    resourceType: defaults.resourceType,
    resourceId: parseExact(single("resourceId"), staffLogIdSchema, 128),
    page: parsePositiveInt(single("page"), LOG_MAX_PAGE, defaults.page),
    pageSize: parseOneOf(single("pageSize"), LOG_PAGE_SIZES, defaults.pageSize),
  };
}

export function serializeStaffLogsSearch(query: StaffLogsQuery): string {
  const defaults = STAFF_LOGS_QUERY_DEFAULTS;
  return serializeParams([
    { key: "q", value: query.q, default: defaults.q },
    ...rangeParams(query),
    { key: "actor", value: query.actorId, default: defaults.actorId },
    { key: "action", value: query.actions[0] ?? "", default: "" },
    { key: "resourceId", value: query.resourceId, default: defaults.resourceId },
    { key: "page", value: query.page, default: defaults.page },
    { key: "pageSize", value: query.pageSize, default: defaults.pageSize },
  ]);
}

export function staffLogsUrl(query: StaffLogsQuery = STAFF_LOGS_QUERY_DEFAULTS): string {
  return `${logsRoutes.staffLogs.href}${serializeStaffLogsSearch(query)}`;
}

/** A filter or page-size change starts again from the first page. */
export function withStaffLogsQueryChange(
  query: StaffLogsQuery,
  change: Partial<Omit<StaffLogsQuery, "page">>,
): StaffLogsQuery {
  return { ...query, ...change, page: 1 };
}

/** Clear filters keeps the page size; everything else returns to default. */
export function clearStaffLogsFilters(query: StaffLogsQuery): StaffLogsQuery {
  return { ...STAFF_LOGS_QUERY_DEFAULTS, pageSize: query.pageSize };
}

export function hasStaffLogsFilters(query: StaffLogsQuery): boolean {
  const defaults = STAFF_LOGS_QUERY_DEFAULTS;
  return (
    query.q !== defaults.q ||
    query.range !== defaults.range ||
    query.actorId !== defaults.actorId ||
    query.actions.length > 0 ||
    query.resourceId !== defaults.resourceId
  );
}

// ---------------------------------------------------------------------------
// Selected record versus the list criteria
// ---------------------------------------------------------------------------

function inRange(instant: string, range: ResolvedRange): boolean {
  const time = new Date(instant).getTime();
  return (
    (range.from === null || time >= new Date(range.from).getTime()) &&
    (range.until === null || time < new Date(range.until).getTime())
  );
}

/** The client's approximation of the server's case-insensitive substring search. */
function mentions(parts: ReadonlyArray<string | null | undefined>, q: string): boolean {
  if (q === "") return true;
  const needle = q.toLowerCase();
  return parts.some((part) => part?.toLowerCase().includes(needle));
}

/**
 * Whether a selected email log would appear under the list's criteria,
 * decided from the fields the dialog already has - a hint for "this record
 * is outside the current filters", never a filter itself.
 */
export function emailLogMatchesCriteria(
  log: EmailLogListItem,
  list: { query: EmailLogsQuery; range: ResolvedRange },
): boolean {
  const { query } = list;
  return (
    inRange(log.startedAt, list.range) &&
    (query.status === "all" || log.status === query.status) &&
    (query.recipient === "" || log.recipientEmail === query.recipient) &&
    (query.userId === "" || log.recipientUserId === query.userId) &&
    mentions([log.subject, log.recipientEmail, log.recipientLabel], query.q)
  );
}
