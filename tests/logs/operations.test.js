import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

/**
 * The four log reads through the real builder pipeline, with the provider
 * session and the query services mocked: admin-only role admission (with
 * the shared role parser), MCP exclusion, no step-up, entry points, strict
 * input, NOT_FOUND for a missing record, and the transport adapters. The
 * services themselves run against PostgreSQL in the integration suite.
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

const services = {
  listEmailLogs: mock(async (ctx, query) => ({ items: [], total: 0, page: 1, pageSize: query.pageSize, query, asOf: "", range: {} })),
  getEmailLogDetail: mock(async (ctx, input) => (input.id === LOG_ID ? { id: input.id, attemptsPage: input.attemptsPage, actor: ctx.user.id } : null)),
  listStaffLogs: mock(async (ctx, query) => ({ items: [], total: 0, page: 1, pageSize: query.pageSize, query, asOf: "", range: {}, reader: ctx.user.id })),
  listStaffLogFilterOptions: mock(async (ctx) => ({ actors: [{ id: ctx.user.id, name: ctx.user.name }], actions: ["user.banned"] })),
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
mock.module("../../app/(LogsModule)/admin/_/db/emailLogQueryService.ts", () => ({
  listEmailLogs: services.listEmailLogs,
  getEmailLogDetail: services.getEmailLogDetail,
}));
mock.module("../../app/(LogsModule)/admin/_/db/staffLogQueryService.ts", () => ({
  listStaffLogs: services.listStaffLogs,
  listStaffLogFilterOptions: services.listStaffLogFilterOptions,
}));

const operations = await import("../../app/(LogsModule)/admin/_/operations/logQueries.ts");
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
  for (const fn of Object.values(services)) fn.mockClear();
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

  test("moderators and users are answered NOT_FOUND, guests UNAUTHENTICATED, before any service runs", async () => {
    for (const role of ["moderator", "user", "user,moderator", null]) {
      as(role);
      for (const [operation, input] of Object.values(reads)) await denied(operation(input, meta), "NOT_FOUND");
    }
    resolved = null;
    for (const [operation, input] of Object.values(reads)) await denied(operation(input, meta), "UNAUTHENTICATED");
    for (const fn of Object.values(services)) expect(fn).not.toHaveBeenCalled();
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
    for (const fn of Object.values(services)) expect(fn).not.toHaveBeenCalled();
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
    for (const fn of Object.values(services)) expect(fn).not.toHaveBeenCalled();
  });

  test("the email detail defaults to the first attempts page and passes the genuine context", async () => {
    const detail = await operations.getEmailLogOperation({ id: LOG_ID }, meta);
    expect(detail).toEqual({ id: LOG_ID, attemptsPage: 1, actor: admin.id });
    expect((await operations.getEmailLogOperation({ id: LOG_ID, attemptsPage: 3 }, meta)).attemptsPage).toBe(3);
  });

  test("a missing record is NOT_FOUND with a safe message", async () => {
    const missing = "01900000-0000-7000-8000-00000000ffff";
    await expect(operations.getEmailLogOperation({ id: missing }, meta)).rejects.toMatchObject({
      reason: "NOT_FOUND",
      message: "This log is not available.",
    });
  });

  test("the staff log read passes the embedding filters and the genuine context to the service", async () => {
    const query = {
      ...STAFF_LOGS_QUERY_DEFAULTS,
      actorId: "admin-2",
      actions: ["user.banned", "user.unbanned"],
      resourceType: "user",
      resourceId: "user-42",
      pageSize: 10,
    };
    const result = await operations.listStaffLogsOperation(query, meta);
    expect(result).toMatchObject({ query, pageSize: 10, reader: admin.id });
    expect(services.listStaffLogs).toHaveBeenCalledTimes(1);
    expect(services.listStaffLogs.mock.calls[0][1]).toEqual(query);
  });

  test("the staff filter options take no input: whatever a caller sends never reaches the service", async () => {
    const options = { actors: [{ id: admin.id, name: admin.name }], actions: ["user.banned"] };
    expect(await operations.listStaffLogFilterOptionsOperation(undefined, meta)).toEqual(options);
    expect(await operations.listStaffLogFilterOptionsOperation({ actorId: "someone-else" }, meta)).toEqual(options);
    for (const call of services.listStaffLogFilterOptions.mock.calls) expect(call).toHaveLength(1);
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
    expect(await getEmailLogAction({ id: LOG_ID })).toEqual({
      ok: true,
      data: { id: LOG_ID, attemptsPage: 1, actor: admin.id },
    });
    const widget = { ...STAFF_LOGS_QUERY_DEFAULTS, resourceId: "user-42", pageSize: 10 };
    expect(await listStaffLogsAction(widget)).toMatchObject({ ok: true, data: { query: widget, reader: admin.id } });
    expect(await listStaffLogsAction({ ...widget, pageSize: 30 })).toMatchObject({ ok: false, reason: "INVALID_INPUT" });
    as("moderator");
    expect(await getEmailLogAction({ id: LOG_ID })).toMatchObject({ ok: false, reason: "NOT_FOUND" });
    expect(await listStaffLogsAction(widget)).toMatchObject({ ok: false, reason: "NOT_FOUND" });
    as("user");
    expect(await listStaffLogsAction(widget)).toMatchObject({ ok: false, reason: "NOT_FOUND" });
    resolved = null;
    expect(await listStaffLogsAction(widget)).toMatchObject({ ok: false, reason: "UNAUTHENTICATED" });
    expect(services.listStaffLogs).toHaveBeenCalledTimes(1);
    // A client cannot claim another entry point.
    as("admin");
    expect(await listStaffLogsAction(widget, { entryPoint: "mcp" })).toMatchObject({ ok: true, data: { query: widget } });
  });
});
