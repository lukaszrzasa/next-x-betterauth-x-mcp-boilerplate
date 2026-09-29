import { describe, expect, test } from "bun:test";
import {
  EMAIL_LOGS_QUERY_DEFAULTS,
  STAFF_LOGS_QUERY_DEFAULTS,
  clampPage,
  clearEmailLogsFilters,
  clearStaffLogsFilters,
  emailLogMatchesCriteria,
  emailLogsUrl,
  hasEmailLogsFilters,
  hasStaffLogsFilters,
  parseEmailLogsSearch,
  parseStaffLogsSearch,
  resolveTimeRange,
  serializeEmailLogsSearch,
  serializeStaffLogsSearch,
  staffLogsUrl,
  withEmailLogsQueryChange,
  withStaffLogsQueryChange,
} from "../../app/(LogsModule)/admin/_/queryState";
import { emailLogsQuerySchema, staffLogsQuerySchema } from "../../app/(LogsModule)/admin/_/schema";

/** The two list URL codecs (email logs and the staff log): forgiving parsing, canonical serialization, range resolution. */

const LOG_ID = "01900000-0000-7000-8000-000000000001";

describe("email logs codec", () => {
  test("defaults: 30 days, newest first, 25 per page, no selection; canonical URL is bare", () => {
    expect(parseEmailLogsSearch({})).toEqual({ query: EMAIL_LOGS_QUERY_DEFAULTS, log: null });
    expect(emailLogsUrl()).toBe("/admin/email-logs");
    expect(emailLogsQuerySchema.safeParse(EMAIL_LOGS_QUERY_DEFAULTS).success).toBe(true);
  });

  test("every supported parameter round-trips to itself, log last", () => {
    const raw = {
      q: "welcome",
      range: "custom",
      from: "2026-09-01",
      to: "2026-09-27",
      status: "failed",
      recipient: "Alice@Example.test",
      userId: " user-42 ",
      sort: "subject",
      direction: "asc",
      page: "3",
      pageSize: "50",
      log: LOG_ID.toUpperCase(),
    };
    const { query, log } = parseEmailLogsSearch(raw);
    expect(query).toEqual({
      q: "welcome",
      range: "custom",
      from: "2026-09-01",
      to: "2026-09-27",
      status: "failed",
      recipient: "alice@example.test",
      userId: "user-42",
      sort: "subject",
      direction: "asc",
      page: 3,
      pageSize: 50,
    });
    expect(log).toBe(LOG_ID);
    const search = serializeEmailLogsSearch(query, log);
    expect(search).toBe(
      `?q=welcome&range=custom&from=2026-09-01&to=2026-09-27&status=failed&recipient=alice%40example.test&userId=user-42&sort=subject&direction=asc&page=3&pageSize=50&log=${LOG_ID}`,
    );
    const again = parseEmailLogsSearch(Object.fromEntries(new URLSearchParams(search)));
    expect(serializeEmailLogsSearch(again.query, again.log)).toBe(search);
    expect(emailLogsQuerySchema.safeParse(query).success).toBe(true);
  });

  test("repeated keys, unknown keys and invalid values fall back to defaults", () => {
    const { query, log } = parseEmailLogsSearch({
      q: ["a", "b"],
      status: "delivered",
      recipient: "not-an-email",
      userId: "x".repeat(129),
      sort: "requester",
      direction: "sideways",
      page: "0",
      pageSize: "30",
      log: "not-a-uuid",
      extra: "1",
    });
    expect(query).toEqual(EMAIL_LOGS_QUERY_DEFAULTS);
    expect(log).toBeNull();
    expect(parseEmailLogsSearch({ page: "1000001" }).query.page).toBe(1);
    expect(parseEmailLogsSearch({ log: [LOG_ID, LOG_ID] }).log).toBeNull();
    // Control characters (PostgreSQL text cannot hold NUL) become spaces; a canonical value re-parses to itself.
    expect(parseEmailLogsSearch({ q: "a\u0000b\tc" }).query.q).toBe("a b c");
    const cut = parseEmailLogsSearch({ q: "x".repeat(199) + " y" }).query.q;
    expect(cut).toBe("x".repeat(199));
    expect(parseEmailLogsSearch({ q: cut }).query.q).toBe(cut);
    const pair = parseEmailLogsSearch({ q: "x".repeat(199) + "😀" }).query.q;
    expect(pair).toBe("x".repeat(199));
    expect(emailLogsQuerySchema.safeParse({ ...EMAIL_LOGS_QUERY_DEFAULTS, q: "a\u0000b" }).success).toBe(false);
  });

  test("an incomplete, invalid or reversed custom range falls back to 30 days; dates need custom", () => {
    for (const raw of [
      { range: "custom" },
      { range: "custom", from: "2026-09-01" },
      { range: "custom", from: "2026-02-30", to: "2026-03-01" },
      { range: "custom", from: "2026-09-27", to: "2026-09-01" },
      { range: "custom", from: "27.09.2026", to: "2026-09-28" },
    ]) {
      expect(parseEmailLogsSearch(raw).query).toMatchObject({ range: "30d", from: "", to: "" });
    }
    expect(parseEmailLogsSearch({ range: "7d", from: "2026-09-01", to: "2026-09-02" }).query).toMatchObject({
      range: "7d",
      from: "",
      to: "",
    });
    expect(parseEmailLogsSearch({ range: "custom", from: "2026-09-27", to: "2026-09-27" }).query.range).toBe("custom");
    // Years PostgreSQL and toISOString() do not agree on fall back as well.
    for (const [from, to] of [["0000-01-01", "2026-01-01"], ["2026-01-01", "9999-12-31"], ["1969-12-31", "2026-01-01"]]) {
      expect(parseEmailLogsSearch({ range: "custom", from, to }).query.range).toBe("30d");
    }
    expect(parseEmailLogsSearch({ range: "custom", from: "1970-01-01", to: "9998-12-31" }).query.range).toBe("custom");
  });

  test("the strict schema refuses what the codec would have normalized", () => {
    const base = EMAIL_LOGS_QUERY_DEFAULTS;
    expect(emailLogsQuerySchema.safeParse({ ...base, range: "custom" }).success).toBe(false);
    expect(emailLogsQuerySchema.safeParse({ ...base, from: "2026-09-01" }).success).toBe(false);
    expect(emailLogsQuerySchema.safeParse({ ...base, recipient: "Alice@x.test" }).success).toBe(false);
    expect(emailLogsQuerySchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(emailLogsQuerySchema.safeParse({ ...base, pageSize: 30 }).success).toBe(false);
  });

  test("changes reset the page; clearing keeps sort and page size", () => {
    const query = { ...EMAIL_LOGS_QUERY_DEFAULTS, page: 4, sort: "recipient", direction: "asc", pageSize: 100, status: "failed" };
    expect(withEmailLogsQueryChange(query, { q: "x" }).page).toBe(1);
    expect(clearEmailLogsFilters(query)).toEqual({ ...EMAIL_LOGS_QUERY_DEFAULTS, sort: "recipient", direction: "asc", pageSize: 100 });
    expect(hasEmailLogsFilters(EMAIL_LOGS_QUERY_DEFAULTS)).toBe(false);
    expect(hasEmailLogsFilters({ ...EMAIL_LOGS_QUERY_DEFAULTS, range: "all" })).toBe(true);
    expect(clampPage({ page: 9, pageSize: 25 }, 51)).toEqual({ page: 3, pageSize: 25 });
    expect(clampPage({ page: 9, pageSize: 25 }, 0)).toEqual({ page: 1, pageSize: 25 });
  });
});

describe("staff log codec", () => {
  test("defaults: 30 days, every actor and action, 25 per page; canonical URL is bare", () => {
    expect(parseStaffLogsSearch({})).toEqual(STAFF_LOGS_QUERY_DEFAULTS);
    expect(STAFF_LOGS_QUERY_DEFAULTS).toEqual({
      q: "",
      range: "30d",
      from: "",
      to: "",
      actorId: "",
      actions: [],
      resourceType: "",
      resourceId: "",
      page: 1,
      pageSize: 25,
    });
    expect(serializeStaffLogsSearch(STAFF_LOGS_QUERY_DEFAULTS)).toBe("");
    expect(staffLogsUrl()).toBe("/admin/staff-logs");
    expect(staffLogsQuerySchema.safeParse(STAFF_LOGS_QUERY_DEFAULTS).success).toBe(true);
  });

  test("every supported parameter round-trips to itself", () => {
    const raw = {
      q: "anna",
      range: "custom",
      from: "2026-09-01",
      to: "2026-09-27",
      actor: " root-user-id ",
      action: "user.banned",
      resourceId: "user-42",
      page: "3",
      pageSize: "50",
    };
    const query = parseStaffLogsSearch(raw);
    expect(query).toEqual({
      q: "anna",
      range: "custom",
      from: "2026-09-01",
      to: "2026-09-27",
      actorId: "root-user-id",
      actions: ["user.banned"],
      resourceType: "",
      resourceId: "user-42",
      page: 3,
      pageSize: 50,
    });
    const search = serializeStaffLogsSearch(query);
    expect(search).toBe(
      "?q=anna&range=custom&from=2026-09-01&to=2026-09-27&actor=root-user-id&action=user.banned&resourceId=user-42&page=3&pageSize=50",
    );
    expect(serializeStaffLogsSearch(parseStaffLogsSearch(Object.fromEntries(new URLSearchParams(search))))).toBe(search);
    expect(staffLogsUrl(query)).toBe(`/admin/staff-logs${search}`);
    expect(staffLogsQuerySchema.safeParse(query).success).toBe(true);
  });

  test("defaults are omitted from the URL, whatever else is set", () => {
    expect(serializeStaffLogsSearch({ ...STAFF_LOGS_QUERY_DEFAULTS, resourceId: "user-42" })).toBe("?resourceId=user-42");
    expect(serializeStaffLogsSearch({ ...STAFF_LOGS_QUERY_DEFAULTS, range: "all", page: 2 })).toBe("?range=all&page=2");
    expect(serializeStaffLogsSearch({ ...STAFF_LOGS_QUERY_DEFAULTS, actorId: "root-user-id", pageSize: 25 })).toBe(
      "?actor=root-user-id",
    );
  });

  test("repeated keys, unknown keys and invalid values fall back to defaults", () => {
    expect(
      parseStaffLogsSearch({
        q: ["a", "b"],
        range: "1y",
        actor: "x".repeat(129),
        action: "User.Banned",
        resourceId: "y".repeat(129),
        page: "0",
        pageSize: "30",
        extra: "1",
        log: LOG_ID,
      }),
    ).toEqual(STAFF_LOGS_QUERY_DEFAULTS);
    expect(parseStaffLogsSearch({ actor: ["a", "b"], action: ["user.banned", "user.unbanned"] })).toEqual(
      STAFF_LOGS_QUERY_DEFAULTS,
    );
    expect(parseStaffLogsSearch({ page: "1000001" }).page).toBe(1);
    expect(parseStaffLogsSearch({ action: "user banned" }).actions).toEqual([]);
    expect(parseStaffLogsSearch({ q: "a\u0000b\tc" }).q).toBe("a b c");
    for (const raw of [
      { range: "custom" },
      { range: "custom", from: "2026-09-01" },
      { range: "custom", from: "2026-09-27", to: "2026-09-01" },
    ]) {
      expect(parseStaffLogsSearch(raw)).toMatchObject({ range: "30d", from: "", to: "" });
    }
    expect(parseStaffLogsSearch({ range: "7d", from: "2026-09-01", to: "2026-09-02" })).toMatchObject({
      range: "7d",
      from: "",
      to: "",
    });
  });

  test("the URL carries one action; the resource type is never read from it", () => {
    expect(parseStaffLogsSearch({ action: "user.banned" }).actions).toEqual(["user.banned"]);
    expect(parseStaffLogsSearch({ actions: "user.banned" }).actions).toEqual([]);
    expect(parseStaffLogsSearch({ resourceType: "user", resourceId: "user-42" })).toMatchObject({
      resourceType: "",
      resourceId: "user-42",
    });
    // Several actions are for embedding code: the URL keeps the first and no resource type.
    expect(
      serializeStaffLogsSearch({ ...STAFF_LOGS_QUERY_DEFAULTS, actions: ["user.banned", "user.unbanned"], resourceType: "user" }),
    ).toBe("?action=user.banned");
  });

  test("the strict schema refuses what the codec would have normalized", () => {
    const base = STAFF_LOGS_QUERY_DEFAULTS;
    expect(
      staffLogsQuerySchema.safeParse({ ...base, actions: ["user.banned", "user.unbanned"], resourceType: "user" }).success,
    ).toBe(true);
    expect(staffLogsQuerySchema.safeParse({ ...base, range: "custom" }).success).toBe(false);
    expect(staffLogsQuerySchema.safeParse({ ...base, from: "2026-09-01" }).success).toBe(false);
    expect(staffLogsQuerySchema.safeParse({ ...base, actions: ["User.Banned"] }).success).toBe(false);
    expect(staffLogsQuerySchema.safeParse({ ...base, actions: "user.banned" }).success).toBe(false);
    expect(
      staffLogsQuerySchema.safeParse({ ...base, actions: Array.from({ length: 21 }, (_, index) => `user.a${index}`) }).success,
    ).toBe(false);
    expect(staffLogsQuerySchema.safeParse({ ...base, resourceType: "User" }).success).toBe(false);
    expect(staffLogsQuerySchema.safeParse({ ...base, actorId: "x".repeat(129) }).success).toBe(false);
    expect(staffLogsQuerySchema.safeParse({ ...base, pageSize: 30 }).success).toBe(false);
    expect(staffLogsQuerySchema.safeParse({ ...base, sort: "time" }).success).toBe(false);
  });

  test("changes reset the page; clearing keeps the page size", () => {
    const query = {
      ...STAFF_LOGS_QUERY_DEFAULTS,
      q: "anna",
      range: "all",
      actorId: "root-user-id",
      actions: ["user.banned"],
      resourceId: "user-42",
      page: 4,
      pageSize: 100,
    };
    expect(withStaffLogsQueryChange(query, { q: "x" })).toEqual({ ...query, q: "x", page: 1 });
    expect(withStaffLogsQueryChange(query, { pageSize: 10 })).toMatchObject({ pageSize: 10, page: 1 });
    expect(clearStaffLogsFilters(query)).toEqual({ ...STAFF_LOGS_QUERY_DEFAULTS, pageSize: 100 });
  });

  test("a filter is anything but the page and its size", () => {
    const base = STAFF_LOGS_QUERY_DEFAULTS;
    expect(hasStaffLogsFilters(base)).toBe(false);
    expect(hasStaffLogsFilters({ ...base, page: 3, pageSize: 100 })).toBe(false);
    for (const change of [
      { q: "anna" },
      { range: "all" },
      { actorId: "root-user-id" },
      { actions: ["user.banned"] },
      { resourceId: "user-42" },
    ]) {
      expect(hasStaffLogsFilters({ ...base, ...change })).toBe(true);
    }
  });
});

describe("time ranges", () => {
  const asOf = new Date("2026-09-27T12:00:00.000Z");

  test("relative ranges are elapsed days ending at asOf", () => {
    expect(resolveTimeRange({ range: "24h", from: "", to: "" }, asOf)).toEqual({
      from: new Date("2026-09-26T12:00:00.000Z"),
      until: new Date("2026-09-27T12:00:00.001Z"),
    });
    expect(resolveTimeRange({ range: "90d", from: "", to: "" }, asOf).from).toEqual(new Date("2026-06-29T12:00:00.000Z"));
    expect(resolveTimeRange({ range: "all", from: "", to: "" }, asOf)).toEqual({ from: null, until: null });
  });

  test("a custom range covers whole UTC days, the end day included", () => {
    expect(resolveTimeRange({ range: "custom", from: "2026-09-01", to: "2026-09-01" }, asOf)).toEqual({
      from: new Date("2026-09-01T00:00:00.000Z"),
      until: new Date("2026-09-02T00:00:00.000Z"),
    });
  });
});

describe("selected record versus list criteria", () => {
  const range = { from: "2026-09-01T00:00:00.000Z", until: "2026-09-02T00:00:00.000Z" };
  const email = {
    id: LOG_ID,
    startedAt: "2026-09-01T10:00:00.000Z",
    recipientEmail: "alice@example.test",
    recipientUserId: "user-42",
    recipientLabel: "Alice",
    subject: "Welcome aboard",
    status: "accepted",
    attemptNumber: 1,
    originalLogId: null,
    requester: { kind: "anonymous", id: null, label: "Anonymous" },
  };

  test("email", () => {
    const query = EMAIL_LOGS_QUERY_DEFAULTS;
    expect(emailLogMatchesCriteria(email, { query, range })).toBe(true);
    expect(emailLogMatchesCriteria({ ...email, startedAt: "2026-09-02T00:00:00.000Z" }, { query, range })).toBe(false);
    expect(emailLogMatchesCriteria(email, { query: { ...query, status: "failed" }, range })).toBe(false);
    expect(emailLogMatchesCriteria(email, { query: { ...query, q: "WELCOME" }, range })).toBe(true);
    expect(emailLogMatchesCriteria(email, { query: { ...query, q: "invoice" }, range })).toBe(false);
    expect(emailLogMatchesCriteria(email, { query: { ...query, userId: "user-7" }, range })).toBe(false);
  });
});
