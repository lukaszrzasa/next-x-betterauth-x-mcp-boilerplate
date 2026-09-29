import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { APIError } from "better-auth/api";

/**
 * The user-administration operations, real from the builder pipeline down
 * to their last decision. What is replaced lies below them: the persistence
 * modules, the provider (`auth.api`, its internal adapter), Redis and the
 * staff log's writer. So these tests cover the gates (entry points, MCP
 * exclusion, permissions per role, staff eligibility, step-up, strict
 * input) and the orchestration each handler owns: target rules from fresh
 * rows, the last-admin invariant, truthful outcomes, recovery without
 * replay and the staff log's contract. SQL and provider behaviour are the
 * integration suite's.
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
const ROOT_ID = "root-1";
const requestHeaders = new Headers({ cookie: "session=real", "user-agent": "test" });

let resolved;
let stored;
let counters;
/** Every call that reached a seam below the operations, in order. */
const touched = [];
/** What the seams answer with; reset before each test. */
let world;

const names = () => touched.map((entry) => entry.name);
const callsTo = (name) => touched.filter((entry) => entry.name === name);

const lock = { holders: [], held: 0 };

/** Each entry notes whether the security lock was held when the call was made. */
const seam = (name, answer) =>
  mock(async (ctx, ...args) => {
    touched.push({ name, ctx, args, locked: lock.held > 0 });
    return answer(ctx, ...args);
  });
const external = (name, answer) =>
  mock(async (...args) => {
    touched.push({ name, args, locked: lock.held > 0 });
    return answer(...args);
  });
const providerError = (code) => new APIError("BAD_REQUEST", { code, message: code });

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const getSession = mock(async () => resolved);
const redis = {
  get: mock(async (key) => stored.get(key) ?? null),
  set: mock(async (key, value, ...options) => {
    if (options.includes("NX") && stored.has(key)) return null;
    stored.set(key, value);
    return "OK";
  }),
  del: mock(async (key) => Number(stored.delete(key))),
  ttl: mock(async (key) => (stored.has(key) || counters.has(key) ? 60 : -2)),
  eval: mock(async () => 0),
};
/** The session authority reads the current user row; this chain answers from the mock session. */
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

const provider = {
  adminUpdateUser: external("auth.api.adminUpdateUser", ({ body }) => world.provider.adminUpdateUser(body)),
  banUser: external("auth.api.banUser", ({ body }) => world.provider.banUser(body)),
  unbanUser: external("auth.api.unbanUser", ({ body }) => world.provider.unbanUser(body)),
  sendVerificationEmail: external("auth.api.sendVerificationEmail", () => world.provider.sendVerificationEmail()),
  requestPasswordReset: external("auth.api.requestPasswordReset", () => ({})),
};
const adapter = {
  listSessions: external("adapter.listSessions", (userId) => world.sessions.filter((entry) => entry.userId === userId)),
  deleteSessions: external("adapter.deleteSessions", (tokens) => world.deleteSessions(tokens)),
  deleteUserSessions: external("adapter.deleteUserSessions", () => {}),
  findSessions: external("adapter.findSessions", (tokens) =>
    world.sessions.filter((entry) => tokens.includes(entry.token)).map((entry) => ({ session: entry })),
  ),
  findUserById: external("adapter.findUserById", (userId) => world.users[userId] ?? null),
  refreshUserSessions: external("adapter.refreshUserSessions", () => world.provider.refreshUserSessions()),
};
const recordStaffLog = seam("recordStaffLog", (ctx, entry) => world.recordStaffLog(entry));

mock.module("server-only", () => ({}));
mock.module("../../src/lib/db/index.ts", () => ({
  db: fakeDb,
  user: { name: "user" },
  emailChangeRequest: { name: "email_change_request" },
}));
mock.module("../../src/lib/auth/index.ts", () => ({
  auth: { api: { getSession, ...provider }, $context: Promise.resolve({ internalAdapter: adapter }) },
}));
mock.module("../../src/lib/redis/index.ts", () => ({
  redis,
  incrementWithTtl: async (key) => {
    counters.set(key, (counters.get(key) ?? 0) + 1);
    return counters.get(key);
  },
  decrementIfExists: async () => 0,
}));
mock.module("../../src/lib/email/index.tsx", () => ({ sendTwoFactorOtpEmail: async () => {} }));
mock.module("next/headers", () => ({ headers: async () => requestHeaders }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("../../app/(LogsModule)/_/db/staffLogService.ts", () => ({ recordStaffLog }));

// ---------------------------------------------------------------------------
// Persistence seams
// ---------------------------------------------------------------------------

mock.module("../../app/(AuthModule)/_/db/security/accountLock.ts", () => ({
  withAccountSecurityLock: async (ctx, userId, work, options = {}) => {
    lock.holders.push({ userId, adminBan: options.adminBan === true });
    touched.push({ name: "lock" });
    lock.held += 1;
    try {
      return await work();
    } finally {
      lock.held -= 1;
    }
  },
  closeAccountSecurityLockPool: async () => {},
}));
mock.module("../../app/(AuthModule)/_/db/security/retirement.ts", () => ({
  retirePendingSecurityState: seam("retirePendingSecurityState", () => 1),
}));
const ADMIN_DB = "../../app/(AuthModule)/admin/_/db/users";
mock.module(`${ADMIN_DB}/listUsers.ts`, () => ({
  listUserRows: seam("listUserRows", (ctx, query) => ({ rows: world.listRows, total: world.listRows.length, page: Math.min(query.page, 1) })),
}));
mock.module(`${ADMIN_DB}/userDetail.ts`, () => ({
  findUserDetailRow: seam("findUserDetailRow", (ctx, userId) => {
    const row = world.users[userId];
    return row ? { ...row, image: null, twoFactorRequired: false, twoFactorEnabled: false } : null;
  }),
}));
mock.module(`${ADMIN_DB}/targets.ts`, () => ({
  findTargetRow: seam("findTargetRow", (ctx, userId) => world.users[userId] ?? null),
  findRootUserId: seam("findRootUserId", () => world.rootUserId),
  countUnbannedAdmins: seam("countUnbannedAdmins", () => world.unbannedAdmins),
}));

const { loadAdminUserOperations } = await import("../helpers/authOperations.js");
const { queries, mutations, emails } = await loadAdminUserOperations();
const { listUsersQuery, getUserQuery } = await import("../../app/(AuthModule)/admin/_/queries.ts");
const { USERS_QUERY_DEFAULTS } = await import("../../app/(AuthModule)/admin/_/queryState.ts");
const { toServerQuery } = await import("../../src/lib/auth/builders/adapters/index.ts");
const { defineAction } = await import("../../src/lib/auth/builders/actionBuilder.ts");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const userRow = (overrides = {}) => ({
  id: "u1",
  name: "Ada",
  email: "ada@example.com",
  role: "user",
  emailVerified: true,
  banned: false,
  banExpires: null,
  banReason: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides,
});

function freshWorld() {
  return {
    rootUserId: ROOT_ID,
    unbannedAdmins: 2,
    users: {
      u1: userRow(),
      unverified: userRow({ id: "unverified", emailVerified: false }),
      banned: userRow({ id: "banned", banned: true, banReason: "spam", banExpires: new Date(Date.now() + DAY) }),
      lapsed: userRow({ id: "lapsed", banned: true, banReason: "old", banExpires: new Date(Date.now() - DAY) }),
      mod: userRow({ id: "mod", role: "moderator" }),
      admin2: userRow({ id: "admin2", role: "admin" }),
      [ROOT_ID]: userRow({ id: ROOT_ID, name: "Root", role: "admin" }),
      [admin.id]: userRow({ id: admin.id, name: "Admin", role: "admin" }),
    },
    listRows: [userRow()],
    sessions: [
      { id: "s-1", token: "t-1", userId: "u1" },
      { id: "s-2", token: "t-2", userId: "u1" },
    ],
    deleteSessions: (tokens) => {
      world.sessions = world.sessions.filter((entry) => !tokens.includes(entry.token));
    },
    recordStaffLog: () => {},
    provider: {
      // The provider's writes land in the rows the operations read back.
      adminUpdateUser: ({ userId, data }) => Object.assign(world.users[userId], data),
      banUser: ({ userId, banReason, banExpiresIn }) =>
        Object.assign(world.users[userId], {
          banned: true,
          banReason,
          banExpires: banExpiresIn ? new Date(Date.now() + banExpiresIn * 1000) : null,
        }),
      unbanUser: ({ userId }) => Object.assign(world.users[userId], { banned: false, banReason: null, banExpires: null }),
      sendVerificationEmail: () => ({}),
      refreshUserSessions: () => {},
    },
  };
}

const meta = { entryPoint: "server-action", headers: requestHeaders };
const as = (role, overrides = {}) => {
  resolved = { user: { ...admin, role, ...overrides }, session: { ...session } };
};
const denied = (promise, reason) => expect(promise).rejects.toMatchObject({ reason });
const grant = () =>
  stored.set(`stepup:grant:${admin.id}:${session.id}`, JSON.stringify({ verifiedAt: Date.now(), securityVersion: 0 }));

/** A clean slate between the operations of one test: accounts, sessions, throttles. */
function startOver() {
  world = freshWorld();
  stored = new Map();
  counters = new Map();
}

/** Runs an operation with a step-up grant in place and reports whether its handler touched anything. */
async function attempt([operation, input], callMeta = meta) {
  touched.length = 0;
  lock.holders.length = 0;
  grant();
  try {
    return { output: await operation(input, callMeta), reached: touched.length > 0 };
  } catch (error) {
    return { error, reached: touched.length > 0 };
  }
}

const operations = {
  list: [queries.listUsersOperation, USERS_QUERY_DEFAULTS],
  get: [queries.getUserOperation, { userId: "u1" }],
  updateName: [mutations.updateUserNameOperation, { userId: "u1", name: "Ada Lovelace" }],
  updateEmail: [mutations.updateUserEmailOperation, { userId: "u1", email: "ada.new@example.com" }],
  revokeSessions: [mutations.revokeUserSessionsOperation, { userId: "u1" }],
  ban: [mutations.banUserOperation, { userId: "u1", duration: "7d", reason: "spam bot" }],
  unban: [mutations.unbanUserOperation, { userId: "banned" }],
  sendVerification: [emails.sendVerificationOperation, { userId: "unverified" }],
  sendPasswordReset: [emails.sendPasswordResetOperation, { userId: "u1" }],
  retryEmailChangeEffects: [mutations.retryEmailChangeEffectsOperation, { userId: "u1" }],
  retryBanSessions: [mutations.retryBanSessionsOperation, { userId: "banned" }],
  retryNameSessionRefresh: [mutations.retryNameSessionRefreshOperation, { userId: "u1" }],
  retryUnbanSessionRefresh: [mutations.retryUnbanSessionRefreshOperation, { userId: "u1" }],
};
const STEP_UP = ["updateEmail", "ban", "retryEmailChangeEffects", "retryBanSessions"];
const on = (name, input) => [operations[name][0], { ...operations[name][1], ...input }];

beforeEach(() => {
  stored = new Map();
  counters = new Map();
  world = freshWorld();
  touched.length = 0;
  lock.holders.length = 0;
  as("admin");
  for (const fn of [getSession, ...Object.values(redis)]) fn.mockClear();
  for (const level of ["log", "warn", "error"]) spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => mock.restore());

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

describe("entry points", () => {
  test("no operation is MCP-eligible, and MCP is refused before anything is touched", async () => {
    for (const [name, [operation, input]] of Object.entries(operations)) {
      expect(operation.mcpAllowed, name).toBe(false);
      await denied(operation(input, { ...meta, entryPoint: "mcp" }), "FORBIDDEN");
    }
    expect(touched).toEqual([]);
  });

  test("unknown provenance denies; server-render is accepted for reads", async () => {
    await denied(queries.listUsersOperation(USERS_QUERY_DEFAULTS, { ...meta, entryPoint: "browser" }), "FORBIDDEN");
    await denied(queries.listUsersOperation(USERS_QUERY_DEFAULTS, { ...meta, entryPoint: undefined }), "FORBIDDEN");
    const page = await queries.listUsersOperation(USERS_QUERY_DEFAULTS, { ...meta, entryPoint: "server-render" });
    expect(page.total).toBe(1);
  });

  test("the SSR adapter reads the request headers itself and takes no caller metadata", async () => {
    const detail = await getUserQuery({ userId: "u1" });
    expect(detail.id).toBe("u1");
    expect(callsTo("findUserDetailRow")[0].ctx.getRequestHeaders().get("cookie")).toBe("session=real");
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
  test("to an ordinary user every operation does not exist (NOT_FOUND), before anything is touched", async () => {
    as("user");
    for (const [operation, input] of Object.values(operations)) await denied(operation(input, meta), "NOT_FOUND");
    expect(touched).toEqual([]);
  });

  test("guests and enrolling staff are refused before anything is touched", async () => {
    resolved = null;
    await denied(mutations.updateUserNameOperation({ userId: "u1", name: "Ada" }, meta), "UNAUTHENTICATED");
    as("moderator", { twoFactorEnabled: false });
    await denied(mutations.updateUserNameOperation({ userId: "u1", name: "Ada" }, meta), "TWO_FACTOR_ENROLLMENT_REQUIRED");
    expect(touched).toEqual([]);
  });

  test("moderator defaults: list, get, name, verification, ban and unban; not email, reset or revocation", async () => {
    as("moderator");
    for (const name of ["list", "get", "updateName", "sendVerification", "ban", "unban", "retryNameSessionRefresh", "retryUnbanSessionRefresh"]) {
      startOver();
      const { reached, error } = await attempt(operations[name]);
      expect(reached, name).toBe(true);
      expect(error, name).toBeUndefined();
    }
    for (const name of ["updateEmail", "sendPasswordReset", "revokeSessions", "retryEmailChangeEffects"]) {
      const { reached, error } = await attempt(operations[name]);
      expect(error?.reason, name).toBe("FORBIDDEN");
      expect(reached, name).toBe(false);
    }
  });

  test("role admission is separate from permissions: unknown and composite roles", async () => {
    as("wizard");
    await denied(queries.listUsersOperation(USERS_QUERY_DEFAULTS, meta), "NOT_FOUND");
    as("moderator,user");
    expect((await queries.listUsersOperation(USERS_QUERY_DEFAULTS, meta)).total).toBe(1);
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
    expect(touched).toEqual([]);
    // A reusable grant satisfies them without a new proof.
    for (const name of STEP_UP) {
      startOver();
      expect((await attempt(operations[name])).output.status, name).toBe("completed");
    }
  });

  test("unban, revocation, reset email, verification email and name edits run without step-up", async () => {
    for (const name of ["unban", "revokeSessions", "sendPasswordReset", "sendVerification", "updateName", "retryNameSessionRefresh", "retryUnbanSessionRefresh"]) {
      startOver();
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
    expect(touched).toEqual([]);
  });

  test("field rules: IDs, names, emails, reasons and durations", async () => {
    for (const userId of ["", " ", "a/b", "a\\b", "x".repeat(129), "tab\there"])
      await denied(mutations.unbanUserOperation({ userId }, meta), "INVALID_INPUT");
    for (const name of ["", " ", "x".repeat(101), "bad\u0007name"])
      await denied(mutations.updateUserNameOperation({ userId: "u1", name }, meta), "INVALID_INPUT");
    for (const email of ["", "not-an-email", `${"x".repeat(250)}@example.com`])
      await denied(mutations.updateUserEmailOperation({ userId: "u1", email }, meta), "INVALID_INPUT");
    for (const reason of ["", "ab", "x".repeat(1001), "bad\u0000reason"])
      await denied(mutations.banUserOperation({ userId: "u1", duration: "24h", reason }, meta), "INVALID_INPUT");
    for (const duration of ["", "1h", "forever", undefined])
      await denied(mutations.banUserOperation({ userId: "u1", duration, reason: "valid reason" }, meta), "INVALID_INPUT");
    expect(touched).toEqual([]);

    // What reaches the provider is the normalized value.
    await attempt(on("updateName", { userId: " u1 ", name: "  Zoë O'Brien  " }));
    expect(callsTo("auth.api.adminUpdateUser")[0].args[0].body).toEqual({ userId: "u1", data: { name: "Zoë O'Brien" } });
    await attempt(on("updateEmail", { email: " Ada.New@Example.COM " }));
    expect(callsTo("auth.api.adminUpdateUser")[0].args[0].body.data.email).toBe("ada.new@example.com");
    await attempt(on("ban", { duration: "permanent", reason: " line one\nline two " }));
    expect(callsTo("auth.api.banUser")[0].args[0].body).toEqual({ userId: "u1", banReason: "line one\nline two" });
  });

  test("the list read is strict about its normalized state", async () => {
    await denied(queries.listUsersOperation({ ...USERS_QUERY_DEFAULTS, pageSize: 33 }, meta), "INVALID_INPUT");
    await denied(queries.listUsersOperation({ ...USERS_QUERY_DEFAULTS, page: 0 }, meta), "INVALID_INPUT");
    await denied(queries.listUsersOperation({ ...USERS_QUERY_DEFAULTS, extra: true }, meta), "INVALID_INPUT");
    expect(touched).toEqual([]);
  });
});

describe("context", () => {
  test("persistence receives a builder context that exposes header copies but never serializes them", async () => {
    await attempt(operations.updateName);
    const { ctx } = callsTo("findTargetRow")[0];
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
    await attempt(operations.updateName, { ...meta, headers });
    headers.set("cookie", "changed");
    expect(callsTo("findTargetRow")[0].ctx.getRequestHeaders().get("cookie")).toBe("session=real");
    // Provider calls authenticate the actor with those headers.
    expect(callsTo("auth.api.adminUpdateUser")[0].args[0].headers.get("cookie")).toBe("session=real");
  });
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

describe("reads", () => {
  test("the list projects rows with the instant the filter was evaluated at", async () => {
    world.listRows = [world.users.u1, world.users.banned, world.users.lapsed];
    const page = await queries.listUsersOperation({ ...USERS_QUERY_DEFAULTS, page: 5 }, meta);
    expect(page.items.map((item) => item.accessStatus)).toEqual(["active", "temporarily-banned", "active"]);
    expect(page.page).toBe(1);
    expect(page.query.page).toBe(1);
    const [query, asOf] = callsTo("listUserRows")[0].args;
    expect(query.page).toBe(5);
    expect(asOf).toBeInstanceOf(Date);
    expect(Object.keys(page.items[0]).sort()).toEqual(
      ["accessStatus", "banExpires", "createdAt", "email", "emailVerified", "id", "image", "name", "roles"].sort(),
    );
  });

  test("the detail publishes what this actor may do; an unknown ID is null, not an error", async () => {
    expect(await queries.getUserOperation({ userId: "nobody" }, meta)).toBeNull();
    expect(names()).toEqual(["findUserDetailRow"]);

    const detail = await queries.getUserOperation({ userId: ROOT_ID }, meta);
    expect(detail).toMatchObject({ isRoot: true, isSelf: false });
    expect(detail.capabilities.updateName).toEqual({ allowed: false, reason: "root-protected" });
    // A lapsed ban is active again, and its reason is not shown.
    const lapsed = await queries.getUserOperation({ userId: "lapsed" }, meta);
    expect(lapsed).toMatchObject({ accessStatus: "active", banReason: null });
    expect(lapsed.capabilities.unban).toEqual({ allowed: false, reason: "not-banned" });
  });

  test("a missing installation record is a configuration failure, never a guessed root", async () => {
    world.rootUserId = null;
    await denied(queries.getUserOperation({ userId: "u1" }, meta), "INTERNAL");
    await denied(mutations.updateUserNameOperation(operations.updateName[1], meta), "INTERNAL");
    expect(names()).not.toContain("auth.api.adminUpdateUser");
  });
});

// ---------------------------------------------------------------------------
// Target rules
// ---------------------------------------------------------------------------

describe("target rules", () => {
  const WRITES = ["updateName", "updateEmail", "revokeSessions", "ban", "sendPasswordReset"];
  const providerCalls = () => names().filter((name) => name.startsWith("auth.api.") || name.startsWith("adapter."));

  test("root is untouchable by anyone else; nothing is written, retired or logged", async () => {
    for (const name of WRITES) {
      const { error } = await attempt(on(name, { userId: ROOT_ID }));
      expect(error, name).toMatchObject({ reason: "FORBIDDEN", data: { reason: "root-protected" } });
      expect(providerCalls(), name).toEqual([]);
      expect(names(), name).not.toContain("retirePendingSecurityState");
      expect(names(), name).not.toContain("recordStaffLog");
    }
  });

  test("root may rename and sign out their own account, and nothing else", async () => {
    as("admin", { id: ROOT_ID });
    stored.set(`stepup:grant:${ROOT_ID}:${session.id}`, JSON.stringify({ verifiedAt: Date.now(), securityVersion: 0 }));
    expect((await mutations.updateUserNameOperation({ userId: ROOT_ID, name: "Root Admin" }, meta)).status).toBe("completed");
    expect(await mutations.revokeUserSessionsOperation({ userId: ROOT_ID }, meta)).toMatchObject({ status: "completed", selfSignedOut: true });
    await expect(mutations.banUserOperation({ userId: ROOT_ID, duration: "24h", reason: "self ban" }, meta)).rejects.toMatchObject({
      data: { reason: "root-self-limit" },
    });
  });

  test("every other actor is refused on their own account; staff targets need manage-staff", async () => {
    expect((await attempt(on("updateName", { userId: admin.id }))).error).toMatchObject({ data: { reason: "self" } });
    as("moderator");
    expect((await attempt(on("updateName", { userId: "mod" }))).error).toMatchObject({ data: { reason: "staff-target" } });
    expect((await attempt(on("ban", { userId: "admin2" }))).error).toMatchObject({ data: { reason: "staff-target" } });
    expect(providerCalls()).toEqual([]);
  });

  test("an account that no longer exists is NOT_FOUND", async () => {
    for (const name of WRITES) {
      expect((await attempt(on(name, { userId: "nobody" }))).error?.reason, name).toBe("NOT_FOUND");
      expect(providerCalls(), name).toEqual([]);
    }
  });

  test("the idempotent no-ops answer unchanged: nothing sent, lifted, charged or logged", async () => {
    expect((await attempt(on("sendVerification", { userId: "u1" }))).output).toEqual({ status: "unchanged", userId: "u1" });
    expect((await attempt(on("unban", { userId: "u1" }))).output).toEqual({ status: "unchanged", userId: "u1" });
    expect((await attempt(on("unban", { userId: "lapsed" }))).output).toEqual({ status: "unchanged", userId: "lapsed" });
    expect((await attempt(on("updateName", { name: "Ada" }))).output).toEqual({ status: "unchanged", userId: "u1" });
    expect((await attempt(on("updateEmail", { email: "ada@example.com" }))).output).toEqual({ status: "unchanged", userId: "u1" });
    expect(names()).not.toContain("retirePendingSecurityState");
    expect(callsTo("recordStaffLog")).toEqual([]);
    expect(counters.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Coordination
// ---------------------------------------------------------------------------

describe("the security lock", () => {
  test("only the email change and the ban take it; the ban takes the global admin-ban lock with it", async () => {
    const locking = {};
    for (const [name, entry] of Object.entries(operations)) {
      startOver();
      const { error } = await attempt(entry);
      expect(error, name).toBeUndefined();
      if (lock.holders.length > 0) locking[name] = [...lock.holders];
    }
    expect(locking).toEqual({
      updateEmail: [{ userId: "u1", adminBan: false }],
      ban: [{ userId: "u1", adminBan: true }],
    });
  });

  test("authorization, the last-admin count and the provider write all happen inside it", async () => {
    await attempt(on("ban", { userId: "admin2" }));
    expect(names().slice(0, 6)).toEqual([
      "lock",
      "findRootUserId",
      "findTargetRow",
      "countUnbannedAdmins",
      "retirePendingSecurityState",
      "auth.api.banUser",
    ]);
    // The staff log is written after the lock is released, by the last call.
    expect(names().at(-1)).toBe("recordStaffLog");
  });

  test("the mail of an email change and the staff log entry are made after it is released", async () => {
    expect((await attempt(operations.updateEmail)).output.status).toBe("completed");
    const heldDuring = Object.fromEntries(touched.map((entry) => [entry.name, entry.locked]));
    expect(heldDuring).toMatchObject({
      findTargetRow: true,
      retirePendingSecurityState: true,
      "auth.api.adminUpdateUser": true,
      "adapter.deleteSessions": true,
      "auth.api.sendVerificationEmail": false,
      recordStaffLog: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

describe("name", () => {
  test("one whitelisted field, an observed refresh, one staff log entry with the name before", async () => {
    expect((await attempt(operations.updateName)).output).toEqual({ status: "completed", userId: "u1" });
    expect(names()).toEqual([
      "findRootUserId",
      "findTargetRow",
      "auth.api.adminUpdateUser",
      "adapter.findUserById",
      "adapter.refreshUserSessions",
      "recordStaffLog",
    ]);
    const [entry] = callsTo("recordStaffLog")[0].args;
    expect(entry).toMatchObject({ action: "user.name.updated", resource: { type: "user", id: "u1" } });
    expect(JSON.stringify(entry.message)).toContain("Ada Lovelace");
  });

  test("a provider error whose write nonetheless committed counts as written", async () => {
    world.provider.adminUpdateUser = ({ userId, data }) => {
      Object.assign(world.users[userId], data);
      throw new Error("hook failed after the write");
    };
    expect((await attempt(operations.updateName)).output.status).toBe("completed");
    expect(callsTo("recordStaffLog")).toHaveLength(1);
  });

  test("a provider error that wrote nothing is reported, translated, and logs nothing", async () => {
    world.provider.adminUpdateUser = () => {
      throw providerError("USER_NOT_FOUND");
    };
    expect((await attempt(operations.updateName)).error.reason).toBe("NOT_FOUND");
    world.provider.adminUpdateUser = () => {
      throw new Error("provider down");
    };
    expect((await attempt(operations.updateName)).error.reason).toBe("INTERNAL");
    expect(callsTo("recordStaffLog")).toEqual([]);
  });

  test("a failed refresh is partial and committed; its retry refreshes and never renames", async () => {
    world.provider.refreshUserSessions = () => {
      throw new Error("redis down");
    };
    expect((await attempt(operations.updateName)).output).toMatchObject({
      status: "partial",
      committed: true,
      failedEffects: [{ effect: "session-refresh", code: "UNAVAILABLE" }],
    });
    // The rename happened, so it is logged; the retry that failed is not.
    expect(callsTo("recordStaffLog")).toHaveLength(1);
    expect((await attempt(operations.retryNameSessionRefresh)).output).toMatchObject({ status: "partial", committed: false });
    expect(callsTo("recordStaffLog")).toEqual([]);

    world.provider.refreshUserSessions = () => {};
    expect((await attempt(operations.retryNameSessionRefresh)).output).toEqual({ status: "completed", userId: "u1" });
    expect(names()).not.toContain("auth.api.adminUpdateUser");
    expect(callsTo("recordStaffLog")[0].args[0].action).toBe("user.sessions.retried");
    expect(world.users.u1.name).toBe("Ada Lovelace");
  });
});

describe("email", () => {
  test("retirement, then one provider write of address, verification and cutoff, then revocation, then the mail", async () => {
    const before = Date.now();
    expect((await attempt(operations.updateEmail)).output).toEqual({ status: "completed", userId: "u1" });
    expect(names()).toEqual([
      "lock",
      "findRootUserId",
      "findTargetRow",
      "retirePendingSecurityState",
      "auth.api.adminUpdateUser",
      "adapter.listSessions",
      "adapter.deleteSessions",
      "adapter.deleteUserSessions",
      "adapter.findSessions",
      "auth.api.sendVerificationEmail",
      "recordStaffLog",
    ]);
    expect(callsTo("retirePendingSecurityState")[0].args).toEqual(["u1", "admin_change"]);
    const { data } = callsTo("auth.api.adminUpdateUser")[0].args[0].body;
    expect(Object.keys(data).sort()).toEqual(["email", "emailVerified", "passwordResetInvalidBefore"]);
    expect(data).toMatchObject({ email: "ada.new@example.com", emailVerified: false });
    expect(data.passwordResetInvalidBefore.getTime()).toBeGreaterThanOrEqual(before);
    // The mail goes to the new address, without the actor's headers.
    expect(callsTo("auth.api.sendVerificationEmail")[0].args[0]).toEqual({ body: { email: "ada.new@example.com" } });
    expect(JSON.stringify(callsTo("recordStaffLog")[0].args[0].message)).toContain("ada@example.com");
  });

  test("an address another account holds is a field conflict; the retirement before it stands", async () => {
    world.provider.adminUpdateUser = () => {
      throw providerError("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
    };
    const { error } = await attempt(operations.updateEmail);
    expect(error).toMatchObject({ reason: "CONFLICT", data: { field: "email", code: "EMAIL_IN_USE" } });
    expect(names()).toContain("retirePendingSecurityState");
    expect(names()).not.toContain("adapter.deleteSessions");
    expect(callsTo("recordStaffLog")).toEqual([]);

    // The same, when the race was lost at the unique constraint itself.
    const violation = Object.assign(new Error("duplicate key"), { code: "23505", constraint: "user_email_unique" });
    world.provider.adminUpdateUser = () => {
      throw new Error("Failed query", { cause: violation });
    };
    expect((await attempt(operations.updateEmail)).error).toMatchObject({ data: { code: "EMAIL_IN_USE" } });
    // Another constraint is not this conflict.
    world.provider.adminUpdateUser = () => {
      throw new Error("Failed query", { cause: { ...violation, constraint: "user_pkey" } });
    };
    expect((await attempt(operations.updateEmail)).error.reason).toBe("INTERNAL");
  });

  test("failed effects after the committed change are partial; the throttled mail reports when to retry", async () => {
    world.deleteSessions = () => {};
    stored.set("admin-email:target:verification:u1", "1");
    expect((await attempt(operations.updateEmail)).output).toMatchObject({
      status: "partial",
      committed: true,
      failedEffects: [
        { effect: "session-revocation", code: "UNAVAILABLE" },
        { effect: "verification-email", code: "RATE_LIMITED", retryAfterSeconds: 60 },
      ],
    });
    expect(world.users.u1.email).toBe("ada.new@example.com");
    expect(callsTo("recordStaffLog")).toHaveLength(1);
  });

  test("recovery repairs the effects for the address the account has now, and writes none", async () => {
    // The account moved on since the request that failed.
    world.users.u1 = userRow({ email: "current@example.com", emailVerified: false });
    expect((await attempt(operations.retryEmailChangeEffects)).output).toEqual({ status: "completed", userId: "u1" });
    expect(callsTo("auth.api.sendVerificationEmail")[0].args[0].body.email).toBe("current@example.com");
    expect(names()).not.toContain("auth.api.adminUpdateUser");
    expect(names()).not.toContain("retirePendingSecurityState");

    // Verified meanwhile: nothing to mail.
    world.users.u1 = userRow({ email: "current@example.com" });
    await attempt(operations.retryEmailChangeEffects);
    expect(names()).not.toContain("auth.api.sendVerificationEmail");
  });
});

describe("sessions", () => {
  test("revokes what exists now; only a confirmed sign-out is logged", async () => {
    expect((await attempt(operations.revokeSessions)).output).toEqual({ status: "completed", userId: "u1", selfSignedOut: false });
    expect(world.sessions).toEqual([]);
    expect(callsTo("recordStaffLog")[0].args[0].action).toBe("user.sessions.revoked");

    world = freshWorld();
    world.deleteSessions = () => {};
    expect((await attempt(operations.revokeSessions)).output).toMatchObject({ status: "partial", committed: false });
    expect(callsTo("recordStaffLog")).toEqual([]);
  });
});

describe("bans", () => {
  test("a temporary ban passes its duration in seconds; a permanent one passes no expiry", async () => {
    expect((await attempt(operations.ban)).output).toEqual({ status: "completed", userId: "u1" });
    expect(callsTo("auth.api.banUser")[0].args[0].body).toEqual({ userId: "u1", banReason: "spam bot", banExpiresIn: 604_800 });
    expect(callsTo("retirePendingSecurityState")[0].args).toEqual(["u1", "banned"]);
    expect(callsTo("recordStaffLog")[0].args[0].action).toBe("user.banned");

    world = freshWorld();
    await attempt(on("ban", { duration: "permanent" }));
    expect(callsTo("auth.api.banUser")[0].args[0].body).not.toHaveProperty("banExpiresIn");
  });

  test("replacing a ban in force is logged as an update and never counts admins", async () => {
    world.users.banned.role = "admin";
    expect((await attempt(on("ban", { userId: "banned" }))).output.status).toBe("completed");
    expect(names()).not.toContain("countUnbannedAdmins");
    expect(callsTo("recordStaffLog")[0].args[0].action).toBe("user.ban.updated");
  });

  test("the last usable admin cannot be banned; nothing is retired or written", async () => {
    world.unbannedAdmins = 1;
    const { error } = await attempt(on("ban", { userId: "admin2" }));
    expect(error).toMatchObject({ reason: "FORBIDDEN", data: { reason: "last-admin" } });
    expect(names()).not.toContain("retirePendingSecurityState");
    expect(names()).not.toContain("auth.api.banUser");
    // Counted under the global lock, from a fresh count.
    expect(lock.holders).toEqual([{ userId: "admin2", adminBan: true }]);
    // Ordinary accounts are not part of the invariant.
    expect((await attempt(operations.ban)).output.status).toBe("completed");
    expect(names()).not.toContain("countUnbannedAdmins");
  });

  test("root protection and the invariant both apply: the denial comes first, the count is never taken", async () => {
    world.unbannedAdmins = 1;
    const { error } = await attempt(on("ban", { userId: ROOT_ID }));
    expect(error).toMatchObject({ data: { reason: "root-protected" } });
    expect(names()).not.toContain("countUnbannedAdmins");
  });

  test("the state the write produced is observed; a ban that did not take is a failure", async () => {
    world.provider.banUser = () => ({});
    expect((await attempt(operations.ban)).error.reason).toBe("INTERNAL");
    expect(names()).not.toContain("adapter.deleteSessions");
    expect(callsTo("recordStaffLog")).toEqual([]);
  });

  test("a provider error after a committed ban counts only when it is this request's ban", async () => {
    const committing = (ban) => ({ userId }) => {
      Object.assign(world.users[userId], { banned: true, ...ban });
      throw new Error("hook failed after the write");
    };
    world.provider.banUser = committing({ banReason: "spam bot", banExpires: new Date(Date.now() + 7 * DAY) });
    expect((await attempt(operations.ban)).output.status).toBe("completed");

    // Someone else's ban on the row is not confirmation of this one.
    for (const other of [
      { banReason: "another reason", banExpires: new Date(Date.now() + 7 * DAY) },
      { banReason: "spam bot", banExpires: new Date(Date.now() + DAY) },
      { banReason: "spam bot", banExpires: null },
    ]) {
      world = freshWorld();
      world.provider.banUser = committing(other);
      expect((await attempt(operations.ban)).error.reason).toBe("INTERNAL");
      expect(callsTo("recordStaffLog")).toEqual([]);
    }
  });

  test("the log records the ban as observed, not as requested", async () => {
    const observed = new Date(Date.now() + 7 * DAY + 1_234);
    world.provider.banUser = ({ userId }) => Object.assign(world.users[userId], { banned: true, banReason: "spam bot (normalized)", banExpires: observed });
    await attempt(operations.ban);
    const message = JSON.stringify(callsTo("recordStaffLog")[0].args[0].message);
    expect(message).toContain("spam bot (normalized)");
    expect(message).toContain(observed.toISOString());
  });

  test("recovery after a partial ban revokes sessions and leaves the ban as it is", async () => {
    world.sessions.push({ id: "s-9", token: "t-9", userId: "banned" });
    const before = { ...world.users.banned };
    expect((await attempt(operations.retryBanSessions)).output).toEqual({ status: "completed", userId: "banned" });
    expect(world.users.banned).toEqual(before);
    expect(world.sessions.map((entry) => entry.userId)).toEqual(["u1", "u1"]);
    expect(names()).not.toContain("auth.api.banUser");
    expect(names()).not.toContain("retirePendingSecurityState");

    // An account that is no longer banned has nothing to finish; nobody is signed out.
    for (const userId of ["u1", "lapsed"]) {
      const { error } = await attempt(on("retryBanSessions", { userId }));
      expect(error).toMatchObject({ reason: "FORBIDDEN", data: { reason: "not-banned" } });
      expect(names()).not.toContain("adapter.deleteSessions");
    }
  });

  test("lifting a ban refreshes the cached copies; its recovery refuses an account that is banned again", async () => {
    expect((await attempt(operations.unban)).output).toEqual({ status: "completed", userId: "banned" });
    expect(callsTo("auth.api.unbanUser")[0].args[0].body).toEqual({ userId: "banned" });
    expect(names()).toContain("adapter.refreshUserSessions");
    expect(callsTo("recordStaffLog")[0].args[0].action).toBe("user.unbanned");

    world = freshWorld();
    const { error } = await attempt(on("retryUnbanSessionRefresh", { userId: "banned" }));
    expect(error).toMatchObject({ reason: "FORBIDDEN", data: { reason: "banned" } });
    expect(names()).not.toContain("adapter.refreshUserSessions");
  });
});

describe("email actions", () => {
  test("charged before sending, and the charge is kept when sending fails", async () => {
    world.provider.sendVerificationEmail = () => {
      throw new Error("mailer down");
    };
    expect((await attempt(operations.sendVerification)).error.reason).toBe("INTERNAL");
    expect(stored.has("admin-email:target:verification:unverified")).toBe(true);
    expect(counters.get(`admin-email:actor:${admin.id}`)).toBe(1);

    world.provider.sendVerificationEmail = () => ({});
    const { error } = await attempt(operations.sendVerification);
    expect(error).toMatchObject({ reason: "RATE_LIMITED", data: { retryAfterSeconds: 60 } });
    // A blocked target does not spend the actor's budget.
    expect(counters.get(`admin-email:actor:${admin.id}`)).toBe(1);
    expect(names()).not.toContain("auth.api.sendVerificationEmail");
  });

  test("the address is the target's current one; neither action changes the account or the staff log", async () => {
    expect((await attempt(operations.sendVerification)).output).toEqual({ status: "completed", userId: "unverified" });
    expect((await attempt(operations.sendPasswordReset)).output).toEqual({ status: "completed", userId: "u1" });
    expect(callsTo("auth.api.requestPasswordReset")[0].args[0].body.email).toBe("ada@example.com");
    expect(callsTo("auth.api.requestPasswordReset")[0].args[0]).not.toHaveProperty("headers");
    expect(callsTo("recordStaffLog")).toEqual([]);
    expect(names()).not.toContain("adapter.deleteSessions");
  });
});

// ---------------------------------------------------------------------------
// Staff log
// ---------------------------------------------------------------------------

describe("staff log", () => {
  const CHANGES = {
    updateName: "user.name.updated",
    updateEmail: "user.email.updated",
    revokeSessions: "user.sessions.revoked",
    ban: "user.banned",
    unban: "user.unbanned",
    retryEmailChangeEffects: "user.sessions.retried",
    retryBanSessions: "user.sessions.retried",
    retryNameSessionRefresh: "user.sessions.retried",
    retryUnbanSessionRefresh: "user.sessions.retried",
  };

  test("every confirmed change writes exactly one entry, about the account it changed", async () => {
    for (const [name, action] of Object.entries(CHANGES)) {
      startOver();
      const { output } = await attempt(operations[name]);
      expect(output.status, name).toBe("completed");
      const entries = callsTo("recordStaffLog");
      expect(entries, name).toHaveLength(1);
      expect(entries[0].args[0], name).toMatchObject({ action, resource: { type: "user", id: operations[name][1].userId } });
      expect(entries[0].ctx.user.id, name).toBe(admin.id);
    }
  });

  test("an entry that cannot be written does not undo or hide the change: the outcome says unrecorded", async () => {
    world.recordStaffLog = () => {
      throw new Error("log table unavailable");
    };
    expect((await attempt(operations.updateName)).output).toEqual({ status: "completed", userId: "u1", unrecorded: true });
    expect(world.users.u1.name).toBe("Ada Lovelace");

    world.provider.refreshUserSessions = () => {
      throw new Error("redis down");
    };
    expect((await attempt(on("updateName", { name: "Ada Byron" }))).output).toMatchObject({
      status: "partial",
      committed: true,
      unrecorded: true,
    });
  });

  test("no secret reaches an entry or a log line", async () => {
    await attempt(operations.updateEmail);
    await attempt(operations.ban);
    const written = JSON.stringify([
      callsTo("recordStaffLog").map((entry) => entry.args),
      ...["log", "warn", "error"].map((level) => console[level].mock.calls),
    ]);
    for (const secret of ["session=real", "t-1", "t-2", "token"]) expect(written).not.toContain(secret);
  });
});
