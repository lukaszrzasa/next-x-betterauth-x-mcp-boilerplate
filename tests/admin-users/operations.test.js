import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

/**
 * The user-administration operations through the real builder pipeline with
 * the provider session, Redis and the services mocked: entry points, MCP
 * exclusion, permissions per role, staff eligibility, step-up per operation
 * and strict input. The services themselves are covered by the integration
 * suite.
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
let stored;
const getSession = mock(async () => resolved);
const requestHeaders = new Headers({ cookie: "session=real", "user-agent": "test" });
const redis = {
  get: mock(async (key) => stored.get(key) ?? null),
  set: mock(async (key, value, ...options) => {
    if (options.includes("NX") && stored.has(key)) return null;
    stored.set(key, value);
    return "OK";
  }),
  del: mock(async (key) => Number(stored.delete(key))),
  ttl: mock(async () => -2),
  eval: mock(async () => 0),
};
const services = {
  listUsers: mock(async (ctx, query) => ({ items: [], total: 0, page: 1, pageSize: query.pageSize, query })),
  getUserDetail: mock(async (ctx, userId) => ({ id: userId, ctxHeaders: ctx.getRequestHeaders() })),
  updateUserName: mock(async (ctx, input) => ({ status: "completed", userId: input.userId, ctx })),
  updateUserEmail: mock(async (ctx, input) => ({ status: "completed", userId: input.userId })),
  revokeUserSessions: mock(async (ctx, input) => ({ status: "completed", userId: input.userId })),
  banUser: mock(async (ctx, input) => ({ status: "completed", userId: input.userId })),
  unbanUser: mock(async (ctx, input) => ({ status: "completed", userId: input.userId })),
  sendVerification: mock(async (ctx, input) => ({ status: "completed", userId: input.userId })),
  sendPasswordReset: mock(async (ctx, input) => ({ status: "completed", userId: input.userId })),
  retryEmailChangeEffects: mock(async (ctx, input) => ({ status: "completed", userId: input.userId })),
  retryBanSessions: mock(async (ctx, input) => ({ status: "completed", userId: input.userId })),
  retryNameSessionRefresh: mock(async (ctx, input) => ({ status: "completed", userId: input.userId })),
  retryUnbanSessionRefresh: mock(async (ctx, input) => ({ status: "completed", userId: input.userId })),
};

mock.module("server-only", () => ({}));
mock.module("../../src/lib/auth/index.ts", () => ({ auth: { api: { getSession } } }));
mock.module("../../src/lib/redis/index.ts", () => ({
  redis,
  incrementWithTtl: async () => 1,
  decrementIfExists: async () => 0,
}));
mock.module("../../src/lib/email/index.tsx", () => ({ sendTwoFactorOtpEmail: async () => {} }));
mock.module("next/headers", () => ({ headers: async () => requestHeaders }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("../../app/(AuthModule)/admin/_/db/users/reads.ts", () => ({
  listUsers: services.listUsers,
  getUserDetail: services.getUserDetail,
}));
mock.module("../../app/(AuthModule)/admin/_/db/users/profile.ts", () => ({
  updateUserName: services.updateUserName,
  updateUserEmail: services.updateUserEmail,
  retryEmailChangeEffects: services.retryEmailChangeEffects,
  retryNameSessionRefresh: services.retryNameSessionRefresh,
}));
mock.module("../../app/(AuthModule)/admin/_/db/users/sessions.ts", () => ({
  revokeUserSessions: services.revokeUserSessions,
}));
mock.module("../../app/(AuthModule)/admin/_/db/users/bans.ts", () => ({
  banUser: services.banUser,
  unbanUser: services.unbanUser,
  retryBanSessions: services.retryBanSessions,
  retryUnbanSessionRefresh: services.retryUnbanSessionRefresh,
}));
mock.module("../../app/(AuthModule)/admin/_/db/users/emails.ts", () => ({
  sendVerification: services.sendVerification,
  sendPasswordReset: services.sendPasswordReset,
}));

const queries = await import("../../app/(AuthModule)/admin/_/operations/usersQueries.ts");
const mutations = await import("../../app/(AuthModule)/admin/_/operations/usersMutations.ts");
const emails = await import("../../app/(AuthModule)/admin/_/operations/usersEmails.ts");
const { listUsersQuery, getUserQuery } = await import("../../app/(AuthModule)/admin/_/queries.ts");
const { USERS_QUERY_DEFAULTS } = await import("../../app/(AuthModule)/admin/_/queryState.ts");
const { toServerQuery } = await import("../../src/lib/auth/builders/adapters/index.ts");
const { defineAction } = await import("../../src/lib/auth/builders/actionBuilder.ts");

const meta = { entryPoint: "server-action", headers: requestHeaders };
const as = (role, overrides = {}) => {
  resolved = { user: { ...admin, role, ...overrides }, session: { ...session } };
};
const denied = (promise, reason) => expect(promise).rejects.toMatchObject({ reason });

const operations = {
  list: [queries.listUsersOperation, USERS_QUERY_DEFAULTS],
  get: [queries.getUserOperation, { userId: "u1" }],
  updateName: [mutations.updateUserNameOperation, { userId: "u1", name: "Ada" }],
  updateEmail: [mutations.updateUserEmailOperation, { userId: "u1", email: "ada@example.com" }],
  revokeSessions: [mutations.revokeUserSessionsOperation, { userId: "u1" }],
  ban: [mutations.banUserOperation, { userId: "u1", duration: "7d", reason: "spam bot" }],
  unban: [mutations.unbanUserOperation, { userId: "u1" }],
  sendVerification: [emails.sendVerificationOperation, { userId: "u1" }],
  sendPasswordReset: [emails.sendPasswordResetOperation, { userId: "u1" }],
  retryEmailChangeEffects: [mutations.retryEmailChangeEffectsOperation, { userId: "u1" }],
  retryBanSessions: [mutations.retryBanSessionsOperation, { userId: "u1" }],
  retryNameSessionRefresh: [mutations.retryNameSessionRefreshOperation, { userId: "u1" }],
  retryUnbanSessionRefresh: [mutations.retryUnbanSessionRefreshOperation, { userId: "u1" }],
};
const STEP_UP = ["updateEmail", "ban", "retryEmailChangeEffects", "retryBanSessions"];

beforeEach(() => {
  stored = new Map();
  as("admin");
  for (const fn of [getSession, ...Object.values(redis), ...Object.values(services)]) fn.mockClear();
  for (const level of ["log", "warn", "error"]) spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => mock.restore());

describe("entry points", () => {
  test("no operation is MCP-eligible, and MCP is refused before any service runs", async () => {
    for (const [name, [operation, input]] of Object.entries(operations)) {
      expect(operation.mcpAllowed, name).toBe(false);
      await denied(operation(input, { ...meta, entryPoint: "mcp" }), "FORBIDDEN");
    }
    for (const fn of Object.values(services)) expect(fn).not.toHaveBeenCalled();
  });

  test("unknown provenance denies; server-render is accepted for reads", async () => {
    await denied(queries.listUsersOperation(USERS_QUERY_DEFAULTS, { ...meta, entryPoint: "browser" }), "FORBIDDEN");
    await denied(queries.listUsersOperation(USERS_QUERY_DEFAULTS, { ...meta, entryPoint: undefined }), "FORBIDDEN");
    const page = await queries.listUsersOperation(USERS_QUERY_DEFAULTS, { ...meta, entryPoint: "server-render" });
    expect(page.total).toBe(0);
  });

  test("the SSR adapter reads the request headers itself and takes no caller metadata", async () => {
    const detail = await getUserQuery({ userId: "u1" });
    expect(detail.id).toBe("u1");
    expect(detail.ctxHeaders.get("cookie")).toBe("session=real");
    expect(getSession.mock.calls[0][0].headers).toBe(requestHeaders);
    const page = await listUsersQuery(USERS_QUERY_DEFAULTS);
    expect(page.query).toEqual(USERS_QUERY_DEFAULTS);
    // Refusals propagate as typed errors rather than an envelope.
    as("user");
    await denied(listUsersQuery(USERS_QUERY_DEFAULTS), "NOT_FOUND");
    resolved = null;
    await denied(getUserQuery({ userId: "u1" }), "UNAUTHENTICATED");
  });

  test("toServerQuery still runs the whole pipeline: enrollment, permission, validation", async () => {
    const guarded = toServerQuery(
      defineAction({ name: "test.read", permissions: "user.list", handler: () => "ok" }),
    );
    as("admin", { twoFactorEnabled: false });
    await denied(guarded(undefined), "TWO_FACTOR_ENROLLMENT_REQUIRED");
    as("admin");
    expect(await guarded(undefined)).toBe("ok");
    await denied(listUsersQuery({ ...USERS_QUERY_DEFAULTS, role: "superuser" }), "INVALID_INPUT");
  });
});

describe("authorization", () => {
  test("to an ordinary user every operation does not exist (NOT_FOUND), before any service runs", async () => {
    as("user");
    for (const [operation, input] of Object.values(operations)) await denied(operation(input, meta), "NOT_FOUND");
    for (const fn of Object.values(services)) expect(fn).not.toHaveBeenCalled();
  });

  test("guests and enrolling staff are refused before any service runs", async () => {
    resolved = null;
    await denied(mutations.updateUserNameOperation({ userId: "u1", name: "Ada" }, meta), "UNAUTHENTICATED");
    as("moderator", { twoFactorEnabled: false });
    await denied(mutations.updateUserNameOperation({ userId: "u1", name: "Ada" }, meta), "TWO_FACTOR_ENROLLMENT_REQUIRED");
    expect(services.updateUserName).not.toHaveBeenCalled();
  });

  test("moderator defaults: list, get, name, verification, ban and unban; not email, reset or revocation", async () => {
    as("moderator");
    for (const name of ["list", "get", "updateName", "sendVerification", "ban", "unban", "retryNameSessionRefresh", "retryUnbanSessionRefresh"]) {
      const [operation, input] = operations[name];
      const result = STEP_UP.includes(name)
        ? await operation(input, meta).catch((error) => error)
        : await operation(input, meta);
      if (STEP_UP.includes(name)) expect(result.reason, name).toBe("TWO_FACTOR_REQUIRED");
      else expect(result, name).toBeTruthy();
    }
    for (const name of ["updateEmail", "sendPasswordReset", "revokeSessions", "retryEmailChangeEffects"]) {
      await denied(operations[name][0](operations[name][1], meta), "FORBIDDEN");
    }
    expect(services.updateUserEmail).not.toHaveBeenCalled();
    expect(services.sendPasswordReset).not.toHaveBeenCalled();
    expect(services.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("role admission is separate from permissions: unknown and composite roles", async () => {
    as("wizard");
    await denied(queries.listUsersOperation(USERS_QUERY_DEFAULTS, meta), "NOT_FOUND");
    as("moderator,user");
    expect((await queries.listUsersOperation(USERS_QUERY_DEFAULTS, meta)).total).toBe(0);
    // Admitted by role but lacking the permission: a plain refusal.
    as("moderator");
    await denied(mutations.revokeUserSessionsOperation({ userId: "u1" }, meta), "FORBIDDEN");
  });
});

describe("step-up", () => {
  test("email change, bans and their recovery twins require step-up even for admin", async () => {
    for (const name of STEP_UP) {
      const [operation, input] = operations[name];
      await denied(operation(input, meta), "TWO_FACTOR_REQUIRED");
    }
    expect(services.updateUserEmail).not.toHaveBeenCalled();
    expect(services.banUser).not.toHaveBeenCalled();
    // A reusable grant satisfies them without a new proof.
    stored.set(`stepup:grant:${admin.id}:${session.id}`, `${Date.now()}`);
    for (const name of STEP_UP) {
      const [operation, input] = operations[name];
      expect((await operation(input, meta)).status).toBe("completed");
    }
  });

  test("unban, revocation, reset email, verification email and name edits run without step-up", async () => {
    for (const name of ["unban", "revokeSessions", "sendPasswordReset", "sendVerification", "updateName", "retryNameSessionRefresh", "retryUnbanSessionRefresh"]) {
      const [operation, input] = operations[name];
      expect((await operation(input, meta)).status, name).toBe("completed");
    }
  });

  test("step-up requires a verified actor email; the requirement is not weakened for admin", async () => {
    as("admin", { emailVerified: false });
    await denied(mutations.updateUserEmailOperation(operations.updateEmail[1], meta), "EMAIL_VERIFICATION_REQUIRED");
    await denied(mutations.banUserOperation(operations.ban[1], meta), "EMAIL_VERIFICATION_REQUIRED");
    expect((await mutations.updateUserNameOperation(operations.updateName[1], meta)).status).toBe("completed");
  });
});

describe("input", () => {
  test("payloads cannot smuggle role, verification or ban fields", async () => {
    for (const extra of [{ role: "admin" }, { emailVerified: true }, { banned: false }, { data: {} }]) {
      await denied(mutations.updateUserNameOperation({ userId: "u1", name: "Ada", ...extra }, meta), "INVALID_INPUT");
      await denied(mutations.updateUserEmailOperation({ userId: "u1", email: "a@b.co", ...extra }, meta), "INVALID_INPUT");
      await denied(mutations.banUserOperation({ ...operations.ban[1], ...extra }, meta), "INVALID_INPUT");
    }
    expect(services.updateUserName).not.toHaveBeenCalled();
  });

  test("field rules: IDs, names, emails, reasons and durations", async () => {
    for (const userId of ["", " ", "a/b", "a\\b", "x".repeat(129), "tab\there"])
      await denied(mutations.unbanUserOperation({ userId }, meta), "INVALID_INPUT");
    for (const name of ["", " ", "x".repeat(101), "bad\u0007name"])
      await denied(mutations.updateUserNameOperation({ userId: "u1", name }, meta), "INVALID_INPUT");
    const named = await mutations.updateUserNameOperation({ userId: " u1 ", name: "  Zoë O'Brien  " }, meta);
    expect(services.updateUserName.mock.calls[0][1]).toEqual({ userId: "u1", name: "Zoë O'Brien" });
    expect(named.status).toBe("completed");
    for (const email of ["", "not-an-email", `${"x".repeat(250)}@example.com`])
      await denied(mutations.updateUserEmailOperation({ userId: "u1", email }, meta), "INVALID_INPUT");
    stored.set(`stepup:grant:${admin.id}:${session.id}`, `${Date.now()}`);
    await mutations.updateUserEmailOperation({ userId: "u1", email: " Ada@Example.COM " }, meta);
    expect(services.updateUserEmail.mock.calls[0][1]).toEqual({ userId: "u1", email: "ada@example.com" });
    for (const reason of ["", "ab", "x".repeat(1001), "bad\u0000reason"])
      await denied(mutations.banUserOperation({ userId: "u1", duration: "24h", reason }, meta), "INVALID_INPUT");
    for (const duration of ["", "1h", "forever", undefined])
      await denied(mutations.banUserOperation({ userId: "u1", duration, reason: "valid reason" }, meta), "INVALID_INPUT");
    await mutations.banUserOperation({ userId: "u1", duration: "permanent", reason: " line one\nline two " }, meta);
    expect(services.banUser.mock.calls[0][1].reason).toBe("line one\nline two");
  });

  test("the list read is strict about its normalized state", async () => {
    await denied(queries.listUsersOperation({ ...USERS_QUERY_DEFAULTS, pageSize: 33 }, meta), "INVALID_INPUT");
    await denied(queries.listUsersOperation({ ...USERS_QUERY_DEFAULTS, page: 0 }, meta), "INVALID_INPUT");
    await denied(queries.listUsersOperation({ ...USERS_QUERY_DEFAULTS, extra: true }, meta), "INVALID_INPUT");
    expect(services.listUsers).not.toHaveBeenCalled();
  });
});

describe("context", () => {
  test("services receive a builder context that exposes header copies but never serializes them", async () => {
    await mutations.updateUserNameOperation({ userId: "u1", name: "Ada" }, meta);
    const ctx = services.updateUserName.mock.calls[0][0];
    const first = ctx.getRequestHeaders();
    expect(first.get("cookie")).toBe("session=real");
    first.set("cookie", "tampered");
    expect(ctx.getRequestHeaders().get("cookie")).toBe("session=real");
    expect(JSON.stringify(ctx)).not.toContain("session=real");
    expect(Object.keys(ctx)).not.toContain("requestHeaders");
    expect(ctx.user.id).toBe(admin.id);
  });

  test("the request's headers are copied, so later mutation of the request does not reach the context", async () => {
    const headers = new Headers({ cookie: "session=real" });
    await mutations.updateUserNameOperation({ userId: "u1", name: "Ada" }, { ...meta, headers });
    headers.set("cookie", "changed");
    expect(services.updateUserName.mock.calls[0][0].getRequestHeaders().get("cookie")).toBe("session=real");
  });
});
