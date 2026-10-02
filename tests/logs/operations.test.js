import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

/**
 * The four log reads through the real builder pipeline, with the provider
 * session and the persistence functions mocked, so the operations
 * themselves run: admin-only role admission (with the shared role parser),
 * MCP exclusion, no step-up, entry points, strict input, the resolved range
 * and criteria handed to persistence, the DTOs made from the rows it
 * returns, NOT_FOUND for a missing record, and the transport adapters. The
 * SQL runs against PostgreSQL in the integration suite.
 */

const admin = {
  id: "admin-1",
  name: "Admin",
  email: "admin@example.com",
  emailVerified: true,
  role: "admin",
  twoFactorRequired: true,
  twoFactorEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const session = { id: "session-1", userId: admin.id, token: "token", impersonatedBy: null };
let resolved;
const getSession = mock(async () => resolved);
const requestHeaders = new Headers({ cookie: "session=real", "user-agent": "test" });
const LOG_ID = "01900000-0000-7000-8000-000000000001";

const at = (iso) => new Date(iso);
const emailRow = {
  id: LOG_ID,
  startedAt: at("2026-09-20T10:00:00.000Z"),
  recipientEmail: "alice@example.test",
  recipientUserId: "user-42",
  recipientLabel: "Alice",
  subject: "Welcome",
  status: "accepted",
  attemptNumber: 2,
  originalLogId: "01900000-0000-7000-8000-000000000000",
  requesterKind: "user",
  requesterId: "admin-2",
  requesterLabel: "Second Admin",
};
const emailDetailRow = {
  ...emailRow,
  createdAt: at("2026-09-20T10:00:00.100Z"),
  updatedAt: at("2026-09-20T10:00:02.000Z"),
  completedAt: at("2026-09-20T10:00:01.000Z"),
  contentText: "Hello",
  provider: "resend",
  providerMessageId: "msg_1",
  previousAttemptId: "01900000-0000-7000-8000-000000000000",
  requestId: "req-1",
  errorCode: null,
  errorMessage: null,
  stackTrace: null,
  redactionVersion: 1,
};
const attemptRow = {
  id: "01900000-0000-7000-8000-000000000000",
  startedAt: at("2026-09-19T10:00:00.000Z"),
  status: "sending",
  attemptNumber: 1,
  requesterKind: "anonymous",
  // An anonymous requester never has an ID, whatever a row holds.
  requesterId: "stray",
  requesterLabel: "Anonymous",
};
const staffRow = {
  id: "01900000-0000-7000-8000-0000000000aa",
  createdAt: at("2026-09-21T08:00:00.000Z"),
  actorId: "admin-2",
  actorName: "Second Admin",
  action: "user.banned",
  resourceType: "user",
  resourceId: "user-42",
  message: [{ type: "text", value: "Banned " }, { type: "chart", html: "<b>raw</b>" }, { type: "user", id: "user-42", label: "Anna" }],
};
/** What no projection selects; a mapper that spread its row would let these through. */
const neverSelected = { recordKey: "key-1", inputDigest: "a".repeat(64), completionDigest: "b".repeat(64), messageText: "Banned Anna" };

const persistence = {
  listEmailLogRows: mock(async () => ({ rows: [{ ...emailRow, ...neverSelected }], total: 1, page: 1 })),
  findEmailLogWithAttempts: mock(async (ctx, target) =>
    target.id === LOG_ID
      ? { row: { ...emailDetailRow, ...neverSelected }, attempts: { rows: [attemptRow], total: 41, page: target.attemptsPage } }
      : null,
  ),
  listStaffLogRows: mock(async () => ({ rows: [{ ...staffRow, ...neverSelected }], total: 1, page: 1 })),
  findStaffLogPresence: mock(async () => ({ actors: [{ id: admin.id, name: admin.name }], actions: ["user.banned"] })),
};

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () =>
          resolved ? [{ ...resolved.user, securityVersion: 0, sessionRevocationPending: false }] : [],
      }),
    }),
  }),
};
mock.module("server-only", () => ({}));
mock.module("../../src/lib/db/index.ts", () => ({
  db: fakeDb,
  user: { name: "user" },
  emailChangeRequest: { name: "email_change_request" },
}));
mock.module("../../src/lib/auth/index.ts", () => ({ auth: { api: { getSession } } }));
mock.module("../../src/lib/redis/index.ts", () => ({
  redis: { get: async () => null, set: async () => "OK", del: async () => 0, ttl: async () => -2, eval: async () => 0 },
  incrementWithTtl: async () => 1,
  decrementIfExists: async () => 0,
}));
mock.module("../../src/lib/email/index.tsx", () => ({ sendTwoFactorOtpEmail: async () => {} }));
mock.module("next/headers", () => ({ headers: async () => requestHeaders }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
const DB = "../../app/(LogsModule)/admin/_/db";
mock.module(`${DB}/email/list.ts`, () => ({ listEmailLogRows: persistence.listEmailLogRows }));
mock.module(`${DB}/email/detail.ts`, () => ({ findEmailLogWithAttempts: persistence.findEmailLogWithAttempts }));
mock.module(`${DB}/staff/list.ts`, () => ({ listStaffLogRows: persistence.listStaffLogRows }));
mock.module(`${DB}/staff/filterOptions.ts`, () => ({ findStaffLogPresence: persistence.findStaffLogPresence }));

const { loadLogReadOperations } = await import("../helpers/logOperations.js");
const operations = await loadLogReadOperations();
const { listEmailLogsQuery, listStaffLogsQuery, listStaffLogFilterOptionsQuery } = await import(
  "../../app/(LogsModule)/admin/_/queries.ts"
);
const { getEmailLogAction, listStaffLogsAction } = await import("../../app/(LogsModule)/admin/_/actions.ts");
const { EMAIL_LOGS_QUERY_DEFAULTS, STAFF_LOGS_QUERY_DEFAULTS } = await import("../../app/(LogsModule)/admin/_/queryState.ts");

const meta = { entryPoint: "server-action", headers: requestHeaders };
const as = (role, overrides = {}) => {
  resolved = { user: { ...admin, role, ...overrides }, session: { ...session } };
};
const denied = (promise, reason) => expect(promise).rejects.toMatchObject({ reason });

const reads = {
  listEmail: [operations.listEmailLogsOperation, EMAIL_LOGS_QUERY_DEFAULTS],
  getEmail: [operations.getEmailLogOperation, { id: LOG_ID }],
  listStaff: [operations.listStaffLogsOperation, STAFF_LOGS_QUERY_DEFAULTS],
  staffFilterOptions: [operations.listStaffLogFilterOptionsOperation, undefined],
};

beforeEach(() => {
  as("admin");
  getSession.mockClear();
  for (const fn of Object.values(persistence)) fn.mockClear();
  for (const level of ["log", "warn", "error"]) spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => mock.restore());

describe("admission", () => {
  test("admin reads every list and detail; a composite role containing admin is admin", async () => {
    for (const role of ["admin", "user,admin", " moderator , admin "]) {
      as(role);
      for (const [operation, input] of Object.values(reads)) await expect(operation(input, meta)).resolves.toBeTruthy();
    }
  });

  test("moderators and users are answered NOT_FOUND, guests UNAUTHENTICATED, before anything is read", async () => {
    for (const role of ["moderator", "user", "user,moderator", null]) {
      as(role);
      for (const [operation, input] of Object.values(reads)) await denied(operation(input, meta), "NOT_FOUND");
    }
    resolved = null;
    for (const [operation, input] of Object.values(reads)) await denied(operation(input, meta), "UNAUTHENTICATED");
    for (const fn of Object.values(persistence)) expect(fn).not.toHaveBeenCalled();
  });

  test("staff enrollment still applies to an admin without a factor", async () => {
    as("admin", { twoFactorEnabled: false });
    for (const [operation, input] of Object.values(reads)) {
      await denied(operation(input, meta), "TWO_FACTOR_ENROLLMENT_REQUIRED");
    }
  });

  test("no read is MCP-eligible, and MCP is refused even for admin; unknown provenance denies", async () => {
    for (const [name, [operation, input]] of Object.entries(reads)) {
      expect(operation.mcpAllowed, name).toBe(false);
      await denied(operation(input, { ...meta, entryPoint: "mcp" }), "FORBIDDEN");
      await denied(operation(input, { ...meta, entryPoint: "browser" }), "FORBIDDEN");
    }
    for (const fn of Object.values(persistence)) expect(fn).not.toHaveBeenCalled();
  });

  test("no step-up: a stray proof is not requested and not needed", async () => {
    for (const [operation, input] of Object.values(reads)) await expect(operation(input, meta)).resolves.toBeTruthy();
  });
});

describe("input and results", () => {
  test("strict inputs refuse what the URL codec would have normalized", async () => {
    await denied(operations.listEmailLogsOperation({ ...EMAIL_LOGS_QUERY_DEFAULTS, status: "delivered" }, meta), "INVALID_INPUT");
    await denied(operations.listEmailLogsOperation({ ...EMAIL_LOGS_QUERY_DEFAULTS, log: LOG_ID }, meta), "INVALID_INPUT");
    await denied(operations.getEmailLogOperation({ id: "not-a-uuid" }, meta), "INVALID_INPUT");
    await denied(operations.getEmailLogOperation({ id: LOG_ID, attemptsPage: 0 }, meta), "INVALID_INPUT");
    const staff = STAFF_LOGS_QUERY_DEFAULTS;
    await denied(operations.listStaffLogsOperation({ ...staff, actions: ["User.Banned"] }, meta), "INVALID_INPUT");
    await denied(operations.listStaffLogsOperation({ ...staff, action: "user.banned" }, meta), "INVALID_INPUT");
    await denied(operations.listStaffLogsOperation({ ...staff, range: "custom" }, meta), "INVALID_INPUT");
    await denied(operations.listStaffLogsOperation({ ...staff, log: LOG_ID }, meta), "INVALID_INPUT");
    await denied(operations.listStaffLogsOperation(undefined, meta), "INVALID_INPUT");
    for (const fn of Object.values(persistence)) expect(fn).not.toHaveBeenCalled();
  });

  test("the email list resolves its range once and hands persistence instants and values, not the URL's words", async () => {
    const query = { ...EMAIL_LOGS_QUERY_DEFAULTS, q: "welcome", status: "failed", recipient: "bob@example.test", userId: "user-bob", sort: "subject", direction: "asc", pageSize: 10 };
    const before = Date.now();
    const page = await operations.listEmailLogsOperation(query, meta);
    const after = Date.now();

    expect(persistence.listEmailLogRows).toHaveBeenCalledTimes(1);
    const [ctx, criteria] = persistence.listEmailLogRows.mock.calls[0];
    expect(ctx.user.id).toBe(admin.id);
    const asOf = Date.parse(page.asOf);
    expect(asOf).toBeGreaterThanOrEqual(before);
    expect(asOf).toBeLessThanOrEqual(after);
    expect(criteria).toEqual({
      q: "welcome",
      startedFrom: new Date(asOf - 30 * 86_400_000),
      startedBefore: new Date(asOf + 1),
      status: "failed",
      recipient: "bob@example.test",
      userId: "user-bob",
      sort: "subject",
      direction: "asc",
      page: 1,
      pageSize: 10,
    });
    expect(page.range).toEqual({ from: criteria.startedFrom.toISOString(), until: criteria.startedBefore.toISOString() });

    await operations.listEmailLogsOperation({ ...EMAIL_LOGS_QUERY_DEFAULTS, range: "all" }, meta);
    expect(persistence.listEmailLogRows.mock.calls[1][1]).toMatchObject({ startedFrom: null, startedBefore: null });
    const custom = await operations.listEmailLogsOperation({ ...EMAIL_LOGS_QUERY_DEFAULTS, range: "custom", from: "2026-09-01", to: "2026-09-02" }, meta);
    expect(persistence.listEmailLogRows.mock.calls[2][1]).toMatchObject({
      startedFrom: at("2026-09-01T00:00:00.000Z"),
      startedBefore: at("2026-09-03T00:00:00.000Z"),
    });
    expect(custom.range).toEqual({ from: "2026-09-01T00:00:00.000Z", until: "2026-09-03T00:00:00.000Z" });
  });

  test("the email list is made of named fields: what the rows also hold does not leave", async () => {
    persistence.listEmailLogRows.mockImplementationOnce(async () => ({ rows: [{ ...emailRow, ...neverSelected }], total: 31, page: 4 }));
    const query = { ...EMAIL_LOGS_QUERY_DEFAULTS, page: 99, pageSize: 10 };
    const page = await operations.listEmailLogsOperation(query, meta);
    expect(page).toMatchObject({ total: 31, page: 4, pageSize: 10, query: { ...query, page: 4 } });
    expect(Object.keys(page).sort()).toEqual(["asOf", "items", "page", "pageSize", "query", "range", "total"]);
    expect(page.items).toEqual([
      {
        id: LOG_ID,
        startedAt: "2026-09-20T10:00:00.000Z",
        recipientEmail: "alice@example.test",
        recipientUserId: "user-42",
        recipientLabel: "Alice",
        subject: "Welcome",
        status: "accepted",
        attemptNumber: 2,
        originalLogId: "01900000-0000-7000-8000-000000000000",
        requester: { kind: "user", id: "admin-2", label: "Second Admin" },
      },
    ]);
  });

  test("the email detail defaults to the first attempts page, asks for 20 attempts and passes the genuine context", async () => {
    const detail = await operations.getEmailLogOperation({ id: LOG_ID }, meta);
    const [ctx, target] = persistence.findEmailLogWithAttempts.mock.calls[0];
    expect(ctx.user.id).toBe(admin.id);
    expect(target).toEqual({ id: LOG_ID, attemptsPage: 1, attemptsPageSize: 20 });
    expect(detail.attempts).toEqual({
      items: [
        {
          id: attemptRow.id,
          startedAt: "2026-09-19T10:00:00.000Z",
          status: "sending",
          attemptNumber: 1,
          requester: { kind: "anonymous", id: null, label: "Anonymous" },
        },
      ],
      page: 1,
      pageSize: 20,
      total: 41,
    });
    expect((await operations.getEmailLogOperation({ id: LOG_ID, attemptsPage: 3 }, meta)).attempts.page).toBe(3);
  });

  test("the email detail never returns the record key or a digest, and shows a status as recorded", async () => {
    const detail = await operations.getEmailLogOperation({ id: LOG_ID }, meta);
    expect(Object.keys(detail).sort()).toEqual(
      ["attemptNumber", "attempts", "completedAt", "contentText", "createdAt", "errorCode", "errorMessage", "id", "originalLogId", "previousAttemptId", "provider", "providerMessageId", "recipientEmail", "recipientLabel", "recipientUserId", "redactionVersion", "requestId", "requester", "stackTrace", "startedAt", "status", "subject", "updatedAt"].sort(),
    );
    expect(detail).toMatchObject({
      createdAt: "2026-09-20T10:00:00.100Z",
      updatedAt: "2026-09-20T10:00:02.000Z",
      completedAt: "2026-09-20T10:00:01.000Z",
      providerMessageId: "msg_1",
      errorCode: null,
    });
    for (const hidden of Object.values(neverSelected)) expect(JSON.stringify(detail)).not.toContain(hidden);

    // Left in `sending` long ago: still `sending`, with no completion time.
    persistence.findEmailLogWithAttempts.mockImplementationOnce(async () => ({
      row: { ...emailDetailRow, status: "sending", completedAt: null, startedAt: at("2020-01-01T00:00:00.000Z") },
      attempts: { rows: [], total: 1, page: 1 },
    }));
    expect(await operations.getEmailLogOperation({ id: LOG_ID }, meta)).toMatchObject({ status: "sending", completedAt: null });
  });

  test("a missing record is NOT_FOUND with a safe, translatable message", async () => {
    const missing = "01900000-0000-7000-8000-00000000ffff";
    await expect(operations.getEmailLogOperation({ id: missing }, meta)).rejects.toMatchObject({
      reason: "NOT_FOUND",
      descriptor: { key: "logsAdmin.errors.logUnavailable" },
    });
  });

  test("the staff log read passes the embedding filters, the resolved range and the genuine context to persistence", async () => {
    const query = {
      ...STAFF_LOGS_QUERY_DEFAULTS,
      actorId: "admin-2",
      actions: ["user.banned", "user.unbanned"],
      resourceType: "user",
      resourceId: "user-42",
      pageSize: 10,
    };
    const result = await operations.listStaffLogsOperation(query, meta);
    expect(result).toMatchObject({ query, pageSize: 10, total: 1, page: 1 });
    expect(persistence.listStaffLogRows).toHaveBeenCalledTimes(1);
    const [ctx, criteria] = persistence.listStaffLogRows.mock.calls[0];
    expect(ctx.user.id).toBe(admin.id);
    const asOf = Date.parse(result.asOf);
    expect(criteria).toEqual({
      q: "",
      createdFrom: new Date(asOf - 30 * 86_400_000),
      createdBefore: new Date(asOf + 1),
      actorId: "admin-2",
      actions: ["user.banned", "user.unbanned"],
      resourceType: "user",
      resourceId: "user-42",
      page: 1,
      pageSize: 10,
    });
    expect(result.range).toEqual({ from: criteria.createdFrom.toISOString(), until: criteria.createdBefore.toISOString() });
  });

  test("staff entries are decoded tolerantly: a block that cannot be read is a placeholder, never its content", async () => {
    const { items } = await operations.listStaffLogsOperation(STAFF_LOGS_QUERY_DEFAULTS, meta);
    expect(items).toEqual([
      {
        id: staffRow.id,
        createdAt: "2026-09-21T08:00:00.000Z",
        actor: { id: "admin-2", name: "Second Admin" },
        action: "user.banned",
        resource: { type: "user", id: "user-42" },
        message: [{ type: "text", value: "Banned " }, { type: "unsupported" }, { type: "user", id: "user-42", label: "Anna" }],
      },
    ]);
    expect(JSON.stringify(items)).not.toContain("<b>raw</b>");

    persistence.listStaffLogRows.mockImplementationOnce(async () => ({ rows: [{ ...staffRow, message: "Banned Anna" }], total: 1, page: 1 }));
    const [entry] = (await operations.listStaffLogsOperation(STAFF_LOGS_QUERY_DEFAULTS, meta)).items;
    expect(entry.message).toEqual([{ type: "unsupported" }]);
  });

  test("the staff filter options take no input: whatever a caller sends never reaches persistence", async () => {
    const options = { actors: [{ id: admin.id, name: admin.name }], actions: ["user.banned"] };
    expect(await operations.listStaffLogFilterOptionsOperation(undefined, meta)).toEqual(options);
    expect(await operations.listStaffLogFilterOptionsOperation({ actorId: "someone-else" }, meta)).toEqual(options);
    for (const call of persistence.findStaffLogPresence.mock.calls) {
      expect(call).toHaveLength(1);
      expect(call[0].user.id).toBe(admin.id);
    }
  });
});

describe("adapters", () => {
  test("SSR list queries run the pipeline with the request headers and propagate typed refusals", async () => {
    expect((await listEmailLogsQuery(EMAIL_LOGS_QUERY_DEFAULTS)).query).toEqual(EMAIL_LOGS_QUERY_DEFAULTS);
    expect((await listStaffLogsQuery(STAFF_LOGS_QUERY_DEFAULTS)).query).toEqual(STAFF_LOGS_QUERY_DEFAULTS);
    expect((await listStaffLogFilterOptionsQuery(undefined)).actions).toEqual(["user.banned"]);
    expect(getSession.mock.calls[0][0].headers).toBe(requestHeaders);
    as("moderator");
    await denied(listEmailLogsQuery(EMAIL_LOGS_QUERY_DEFAULTS), "NOT_FOUND");
    await denied(listStaffLogsQuery(STAFF_LOGS_QUERY_DEFAULTS), "NOT_FOUND");
    await denied(listStaffLogFilterOptionsQuery(undefined), "NOT_FOUND");
  });

  test("Server Actions return envelopes and re-check access when called directly", async () => {
    expect(await getEmailLogAction({ id: LOG_ID })).toMatchObject({
      ok: true,
      data: { id: LOG_ID, subject: "Welcome", attempts: { page: 1, pageSize: 20 } },
    });
    const widget = { ...STAFF_LOGS_QUERY_DEFAULTS, resourceId: "user-42", pageSize: 10 };
    expect(await listStaffLogsAction(widget)).toMatchObject({ ok: true, data: { query: widget, items: [{ id: staffRow.id }] } });
    expect(persistence.listStaffLogRows.mock.calls[0][0].user.id).toBe(admin.id);
    expect(await listStaffLogsAction({ ...widget, pageSize: 30 })).toMatchObject({ ok: false, reason: "INVALID_INPUT" });
    as("moderator");
    expect(await getEmailLogAction({ id: LOG_ID })).toMatchObject({ ok: false, reason: "NOT_FOUND" });
    expect(await listStaffLogsAction(widget)).toMatchObject({ ok: false, reason: "NOT_FOUND" });
    as("user");
    expect(await listStaffLogsAction(widget)).toMatchObject({ ok: false, reason: "NOT_FOUND" });
    resolved = null;
    expect(await listStaffLogsAction(widget)).toMatchObject({ ok: false, reason: "UNAUTHENTICATED" });
    expect(persistence.listStaffLogRows).toHaveBeenCalledTimes(1);
    // A client cannot claim another entry point.
    as("admin");
    expect(await listStaffLogsAction(widget, { entryPoint: "mcp" })).toMatchObject({ ok: true, data: { query: widget } });
  });
});
