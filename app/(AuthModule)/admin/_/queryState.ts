import { authRoutes } from "@/app/(AuthModule)/_/routes";
import {
  lastPage,
  parseEnum,
  parseOneOf,
  parsePositiveInt,
  parseText,
  readSingle,
  serializeParams,
  toRawSearchParams,
  type RawSearchParams,
} from "@/src/lib/data-table/queryState";
import {
  SORT_DIRECTIONS,
  USER_PAGE_SIZES,
  USER_ROLE_FILTERS,
  USER_SORTS,
  USER_STATUS_FILTERS,
  USER_VERIFIED_FILTERS,
  USERS_MAX_PAGE,
  USERS_SEARCH_MAX_LENGTH,
} from "./schema";
import { RETURN_TO_PARAM, type UsersQuery } from "./types";

/**
 * The users list's URL codec: parameter names, defaults and reset rules.
 * Parsing is forgiving (unsupported or repeated values fall back to their
 * default, unknown keys are dropped); serialization is canonical (table
 * order, defaults omitted, values encoded), so a URL round-trips to itself.
 */

export const USERS_QUERY_DEFAULTS: UsersQuery = {
  q: "",
  role: "all",
  verified: "all",
  status: "all",
  sort: "createdAt",
  direction: "desc",
  page: 1,
  pageSize: 25,
};

export function parseUsersQuery(raw: RawSearchParams): UsersQuery {
  const single = (key: string) => readSingle(raw, key);
  const defaults = USERS_QUERY_DEFAULTS;

  return {
    q: parseText(single("q"), USERS_SEARCH_MAX_LENGTH),
    role: parseEnum(single("role"), USER_ROLE_FILTERS, defaults.role),
    verified: parseEnum(single("verified"), USER_VERIFIED_FILTERS, defaults.verified),
    status: parseEnum(single("status"), USER_STATUS_FILTERS, defaults.status),
    sort: parseEnum(single("sort"), USER_SORTS, defaults.sort),
    direction: parseEnum(single("direction"), SORT_DIRECTIONS, defaults.direction),
    page: parsePositiveInt(single("page"), USERS_MAX_PAGE, defaults.page),
    pageSize: parseOneOf(single("pageSize"), USER_PAGE_SIZES, defaults.pageSize),
  };
}

/** The query string ("" when everything is default), never the pathname. */
export function serializeUsersQuery(query: UsersQuery): string {
  const defaults = USERS_QUERY_DEFAULTS;
  return serializeParams([
    { key: "q", value: query.q, default: defaults.q },
    { key: "role", value: query.role, default: defaults.role },
    { key: "verified", value: query.verified, default: defaults.verified },
    { key: "status", value: query.status, default: defaults.status },
    { key: "sort", value: query.sort, default: defaults.sort },
    { key: "direction", value: query.direction, default: defaults.direction },
    { key: "page", value: query.page, default: defaults.page },
    { key: "pageSize", value: query.pageSize, default: defaults.pageSize },
  ]);
}

/** The canonical relative list URL for a state. */
export function usersListUrl(query: UsersQuery = USERS_QUERY_DEFAULTS): string {
  return `${authRoutes.adminUsers.href}${serializeUsersQuery(query)}`;
}

/** Clear filters keeps the sort and page size; everything else returns to default. */
export function clearUsersFilters(query: UsersQuery): UsersQuery {
  return {
    ...USERS_QUERY_DEFAULTS,
    sort: query.sort,
    direction: query.direction,
    pageSize: query.pageSize,
  };
}

/** A filter, sort or page-size change starts again from the first page. */
export function withUsersQueryChange(
  query: UsersQuery,
  change: Partial<Omit<UsersQuery, "page">>,
): UsersQuery {
  return { ...query, ...change, page: 1 };
}

/** True when any of the user-facing filters is set. */
export function hasUsersFilters(query: UsersQuery): boolean {
  return (
    query.q !== USERS_QUERY_DEFAULTS.q ||
    query.role !== USERS_QUERY_DEFAULTS.role ||
    query.verified !== USERS_QUERY_DEFAULTS.verified ||
    query.status !== USERS_QUERY_DEFAULTS.status
  );
}

/** Pages past the end fold onto the last page; an empty result is page 1. */
export function clampUsersPage(query: UsersQuery, total: number): UsersQuery {
  const page = Math.min(query.page, lastPage(total, query.pageSize));
  return page === query.page ? query : { ...query, page };
}

/**
 * The list URL a detail page links back to. Accepted only when it is a
 * relative `/admin/users` URL whose query survives this codec; anything else
 * (another path, an origin, a fragment, malformed input) yields the default
 * list. Never redirect or link to a supplied URL as-is.
 */
export function resolveReturnTo(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return usersListUrl();
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return usersListUrl();
  }

  let url: URL;
  try {
    url = new URL(value, "http://relative.invalid");
  } catch {
    return usersListUrl();
  }

  if (
    url.origin !== "http://relative.invalid" ||
    url.pathname !== authRoutes.adminUsers.href ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return usersListUrl();
  }

  return usersListUrl(parseUsersQuery(toRawSearchParams(url.searchParams)));
}

/** A detail URL carrying the current (canonical) list state for the way back. */
export function userDetailUrl(userDetailPath: string, listQuery: UsersQuery): string {
  const returnTo = usersListUrl(listQuery);
  return returnTo === usersListUrl()
    ? userDetailPath
    : `${userDetailPath}?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}`;
}
