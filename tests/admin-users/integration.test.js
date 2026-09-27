import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { Pool } from "pg";

/**
 * Provider integration for user administration against an isolated
 * PostgreSQL database and Redis database. Opt-in: set TEST_DATABASE_URL and
 * TEST_REDIS_URL to test-only services that differ from DATABASE_URL and
 * REDIS_URL (see "Verification" in the feature README). The suite refuses
 * to touch the configured development database and reports itself skipped
 * rather than silently passing.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const misconfigured =
  (TEST_DATABASE_URL && TEST_DATABASE_URL === process.env.DATABASE_URL) ||
  (TEST_REDIS_URL && TEST_REDIS_URL === process.env.REDIS_URL);
const configured = Boolean(TEST_DATABASE_URL && TEST_REDIS_URL && !misconfigured);
if (misconfigured) {
  throw new Error("TEST_DATABASE_URL / TEST_REDIS_URL must not point at the configured DATABASE_URL / REDIS_URL.");
}
if (!configured) {
  console.warn("admin-users integration: skipped (set TEST_DATABASE_URL and TEST_REDIS_URL to run).");
} else {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
}

const browser = new AsyncLocalStorage();
const sent = { verification: [], reset: [], otp: [], emailChange: [] };
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("../../src/lib/email/index.tsx", () => ({
  sendVerificationEmail: async (message) => {
    sent.verification.push(message);
  },
  sendPasswordResetEmail: async (message) => {
    sent.reset.push(message);
  },
  sendTwoFactorOtpEmail: async (message) => {
    sent.otp.push(message);
  },
  sendEmailChangeConfirmationEmail: async (message) => {
    sent.emailChange.push(message);
  },
}));
mock.module("next/headers", () => ({
  headers: async () => new Headers(browser.getStore()?.headers ?? {}),
  cookies: async () => {
    const store = browser.getStore()?.cookies ?? new Map();
    return {
      get: (key) => (store.has(key) ? { value: store.get(key) } : undefined),
      set: (key, value) => store.set(key, value),
      delete: (key) => store.delete(key),
    };
  },
}));

const { db, user: userTable, installation } = await import("../../src/lib/db/index.ts");
const { redis } = await import("../../src/lib/redis/index.ts");
const { auth } = await import("../../src/lib/auth/index.ts");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { sql } = await import("drizzle-orm");
const { loadInstallationState } = await import("../../src/lib/auth/installation.ts");
const { closeUserAccountLockPool } = await import("../../app/(AuthModule)/_/db/userAccountLock.ts");
const { setupRootAdmin } = await import("../../app/(AuthModule)/_/operations/setup.ts");
const queries = await import("../../app/(AuthModule)/admin/_/operations/usersQueries.ts");
const mutations = await import("../../app/(AuthModule)/admin/_/operations/usersMutations.ts");
const emails = await import("../../app/(AuthModule)/admin/_/operations/usersEmails.ts");
const { USERS_QUERY_DEFAULTS } = await import("../../app/(AuthModule)/admin/_/queryState.ts");
const { ADMIN_EMAIL_ACTOR_LIMIT } = await import("../../app/(AuthModule)/admin/_/db/users/throttle.ts");
const { revokeCurrentUserSessions, refreshCommittedUserSessions } =
  await import("../../src/lib/auth/userSessionEffects.ts");

const adminPool = configured ? new Pool({ connectionString: TEST_DATABASE_URL }) : null;
const rootInput = { name: "Root Admin", email: "root@example.com", password: "root-password-12345" };
const actors = {};

/** A provider session for `userId`, signed the way Better Auth signs its cookie. */
async function sessionCookie(userId) {
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  const signature = createHmac("sha256", context.secret).update(session.token).digest("base64");
  return {
    session,
    cookie: `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`,
  };
}

function metaFor(actor, extra = {}) {
  return { entryPoint: "server-action", headers: new Headers({ cookie: actor.cookie }), ...extra };
}

/** Runs an operation with the actor's request scope (cookies for nextCookies). */
function run(actor, operation, input, extra) {
  return browser.run({ cookies: new Map(), headers: { cookie: actor.cookie } }, () =>
    operation(input, metaFor(actor, extra)),
  );
}

async function grantStepUp(actor) {
  const [current] = await db.select({ securityVersion: userTable.securityVersion }).from(userTable).where(sql`${userTable.id} = ${actor.id}`);
  await redis.set(
    `stepup:grant:${actor.id}:${actor.session.id}`,
    JSON.stringify({ verifiedAt: Date.now(), securityVersion: current?.securityVersion ?? 0 }),
    "EX",
    300,
  );
}

async function createUser({ name, email, role = "user", staffEnrolled = false, emailVerified = true }) {
  const { user } = await auth.api.createUser({
    body: { name, email, password: "password-12345", role, data: { twoFactorRequired: staffEnrolled } },
    headers: new Headers({ cookie: actors.root.cookie }),
  });
  await db
    .update(userTable)
    .set({ emailVerified, ...(staffEnrolled ? { twoFactorEnabled: true } : {}) })
    .where(sql`${userTable.id} = ${user.id}`);
  return user.id;
}

async function actorFor(id) {
  const { session, cookie } = await sessionCookie(id);
  return { id, session, cookie };
}

async function row(id) {
  const [found] = await db.select().from(userTable).where(sql`${userTable.id} = ${id}`).limit(1);
  return found ?? null;
}

const activeSessions = async (id) => (await auth.$context).internalAdapter.listSessions(id, { onlyActiveSessions: true });
const denied = (promise, reason) => expect(promise).rejects.toMatchObject({ reason });

describe.skipIf(!configured)("admin users integration", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await adminPool.query('TRUNCATE "user" CASCADE');
    await adminPool.query("TRUNCATE installation");
    await redis.flushdb();
    await loadInstallationState();

    // The root account through the real setup operation, then an enrolled factor.
    await browser.run({ cookies: new Map(), headers: {} }, () =>
      setupRootAdmin(rootInput, { entryPoint: "server-action", headers: new Headers() }),
    );
    const [root] = await db.select().from(userTable);
    await db.update(userTable).set({ twoFactorEnabled: true, emailVerified: true }).where(sql`${userTable.id} = ${root.id}`);
    actors.root = await actorFor(root.id);

    actors.admin = await actorFor(await createUser({ name: "Second Admin", email: "admin2@example.com", role: "admin", staffEnrolled: true }));
    actors.moderator = await actorFor(await createUser({ name: "Mod Erator", email: "mod@example.com", role: "moderator", staffEnrolled: true }));
    actors.user = await actorFor(await createUser({ name: "Plain User", email: "plain@example.com" }));
  }, 60_000);

  afterAll(async () => {
    await closeUserAccountLockPool();
    await adminPool?.end();
    redis.disconnect();
  });

  beforeEach(() => {
    sent.verification.length = 0;
    sent.reset.length = 0;
    for (const level of ["log", "warn", "error"]) spyOn(console, level).mockImplementation(() => {});
  });

  test("reads: list projection, filters, sort and detail capabilities from real rows", async () => {
    const page = await run(actors.root, queries.listUsersOperation, USERS_QUERY_DEFAULTS);
    expect(page.total).toBe(4);
    const item = page.items.find((entry) => entry.id === actors.user.id);
    expect(Object.keys(item).sort()).toEqual(
      ["accessStatus", "banExpires", "createdAt", "email", "emailVerified", "id", "image", "name", "roles"].sort(),
    );
    expect(item.roles).toEqual(["user"]);
    const staff = await run(actors.root, queries.listUsersOperation, { ...USERS_QUERY_DEFAULTS, role: "admin", sort: "email", direction: "asc" });
    expect(staff.items.map((entry) => entry.email)).toEqual(["admin2@example.com", "root@example.com"]);
    const detail = await run(actors.moderator, queries.getUserOperation, { userId: actors.user.id });
    expect(detail.capabilities.updateName.allowed).toBe(true);
    expect(detail.capabilities.updateEmail).toEqual({ allowed: false, reason: "permission" });
    expect(detail.isRoot).toBe(false);
    expect(detail).not.toHaveProperty("passwordResetInvalidBefore");
    expect(await run(actors.root, queries.getUserOperation, { userId: "missing" })).toBeNull();
  });

  test("name: only the name changes, unchanged is a no-op, cached session copies are refreshed", async () => {
    const before = await row(actors.user.id);
    const outcome = await run(actors.root, mutations.updateUserNameOperation, { userId: actors.user.id, name: "Renamed User" });
    expect(outcome).toEqual({ status: "completed", userId: actors.user.id });
    const after = await row(actors.user.id);
    expect(after.name).toBe("Renamed User");
    for (const key of ["email", "emailVerified", "role", "banned", "banReason", "banExpires", "twoFactorRequired", "twoFactorEnabled", "passwordResetInvalidBefore"])
      expect(after[key]).toEqual(before[key]);
    // The user's own live session now carries the new name.
    const session = await auth.api.getSession({ headers: new Headers({ cookie: actors.user.cookie }), query: { disableCookieCache: true } });
    expect(session.user.name).toBe("Renamed User");
    expect(await run(actors.root, mutations.updateUserNameOperation, { userId: actors.user.id, name: "Renamed User" })).toEqual({
      status: "unchanged",
      userId: actors.user.id,
    });
  });

  test("root and self rules are enforced from the installation record, not the browser", async () => {
    await denied(run(actors.admin, mutations.updateUserNameOperation, { userId: actors.root.id, name: "Hijack" }), "FORBIDDEN");
    await denied(run(actors.admin, mutations.updateUserNameOperation, { userId: actors.admin.id, name: "Me" }), "FORBIDDEN");
    await grantStepUp(actors.root);
    await denied(run(actors.root, mutations.updateUserEmailOperation, { userId: actors.root.id, email: "new-root@example.com" }), "FORBIDDEN");
    await denied(run(actors.root, mutations.banUserOperation, { userId: actors.root.id, duration: "24h", reason: "self ban" }), "FORBIDDEN");
    await grantStepUp(actors.admin);
    await denied(run(actors.admin, mutations.banUserOperation, { userId: actors.root.id, duration: "24h", reason: "root ban" }), "FORBIDDEN");
    expect((await row(actors.root.id)).banned).toBe(false);
    expect((await row(actors.root.id)).name).toBe(rootInput.name);
    // Root may rename themselves.
    expect((await run(actors.root, mutations.updateUserNameOperation, { userId: actors.root.id, name: "Root Renamed" })).status).toBe("completed");
    await run(actors.root, mutations.updateUserNameOperation, { userId: actors.root.id, name: rootInput.name });
  });

  test("staff targets need manage-staff; a moderator cannot touch another staff account", async () => {
    await denied(run(actors.moderator, mutations.updateUserNameOperation, { userId: actors.admin.id, name: "Nope" }), "FORBIDDEN");
    await denied(run(actors.moderator, emails.sendVerificationOperation, { userId: actors.admin.id }), "FORBIDDEN");
    expect(sent.verification).toHaveLength(0);
    expect((await run(actors.moderator, mutations.updateUserNameOperation, { userId: actors.user.id, name: "Plain User" })).status).toBe("completed");
  });

  test("verification email: another user's address, without actor headers, throttled per target and actor", async () => {
    const unverifiedId = await createUser({ name: "Unverified", email: "unverified@example.com", emailVerified: false });
    const first = await run(actors.moderator, emails.sendVerificationOperation, { userId: unverifiedId });
    expect(first).toEqual({ status: "completed", userId: unverifiedId });
    expect(sent.verification).toHaveLength(1);
    expect(sent.verification[0].to).toBe("unverified@example.com");
    expect(sent.verification[0].url).toContain("/auth/email-confirmation?token=");
    // Cooldown per target and action.
    await expect(run(actors.moderator, emails.sendVerificationOperation, { userId: unverifiedId })).rejects.toMatchObject({
      reason: "RATE_LIMITED",
      data: { retryAfterSeconds: expect.any(Number) },
    });
    expect(sent.verification).toHaveLength(1);
    // Already verified is a no-op, and sends nothing.
    expect(await run(actors.root, emails.sendVerificationOperation, { userId: actors.user.id })).toEqual({ status: "unchanged", userId: actors.user.id });
    expect(sent.verification).toHaveLength(1);
    // The actor budget is shared across both actions and instances (it lives in Redis).
    const targets = [];
    for (let index = 0; index < ADMIN_EMAIL_ACTOR_LIMIT; index += 1)
      targets.push(await createUser({ name: `Bulk ${index}`, email: `bulk${index}@example.com`, emailVerified: false }));
    let sentCount = 0;
    let limited = 0;
    for (const target of targets) {
      const result = await run(actors.moderator, emails.sendVerificationOperation, { userId: target }).catch((error) => error);
      if (result.reason === "RATE_LIMITED") limited += 1;
      else sentCount += 1;
    }
    expect(sentCount).toBe(ADMIN_EMAIL_ACTOR_LIMIT - 1);
    expect(limited).toBe(1);
    await redis.del(`admin-email:actor:${actors.moderator.id}`);
  }, 60_000);

  test("password-reset email uses the existing flow and changes nothing at request time", async () => {
    const before = await row(actors.user.id);
    const { cookie } = await sessionCookie(actors.user.id);
    const outcome = await run(actors.root, emails.sendPasswordResetOperation, { userId: actors.user.id });
    expect(outcome.status).toBe("completed");
    expect(sent.reset).toHaveLength(1);
    expect(sent.reset[0].to).toBe(before.email);
    expect(sent.reset[0].url).toMatch(/\/api\/auth\/reset-password\/[A-Za-z0-9_-]+\?callbackURL=%2Fauth%2Freset-password$/);
    const after = await row(actors.user.id);
    expect(after.twoFactorEnabled).toBe(before.twoFactorEnabled);
    const [account] = (await adminPool.query('select password from account where user_id = $1', [actors.user.id])).rows;
    expect(account.password).toBeTruthy();
    expect(await auth.api.getSession({ headers: new Headers({ cookie }), query: { disableCookieCache: true } })).toBeTruthy();
    await denied(run(actors.moderator, emails.sendPasswordResetOperation, { userId: actors.user.id }), "FORBIDDEN");
    await redis.del(`admin-email:target:password-reset:${actors.user.id}`);
  });

  test("email change: normalization, conflict, cutoff, revocation, verification to the new address, old reset links refused", async () => {
    const targetId = await createUser({ name: "Mover", email: "mover@example.com" });
    const { cookie: victimCookie } = await sessionCookie(targetId);
    await run(actors.root, emails.sendPasswordResetOperation, { userId: targetId });
    const oldResetToken = sent.reset[0].url.match(/reset-password\/([^?]+)/)[1];
    await redis.del(`admin-email:target:password-reset:${targetId}`);

    await grantStepUp(actors.root);
    await expect(run(actors.root, mutations.updateUserEmailOperation, { userId: targetId, email: "Plain@Example.com" })).rejects.toMatchObject({
      reason: "CONFLICT",
      data: { field: "email", code: "EMAIL_IN_USE" },
    });
    expect((await row(targetId)).email).toBe("mover@example.com");
    expect(await run(actors.root, mutations.updateUserEmailOperation, { userId: targetId, email: " MOVER@example.com " })).toEqual({
      status: "unchanged",
      userId: targetId,
    });

    const startedAt = new Date();
    const outcome = await run(actors.root, mutations.updateUserEmailOperation, { userId: targetId, email: " Moved@Example.com " });
    expect(outcome).toEqual({ status: "completed", userId: targetId });
    const after = await row(targetId);
    expect(after.email).toBe("moved@example.com");
    expect(after.emailVerified).toBe(false);
    expect(after.passwordResetInvalidBefore.getTime()).toBeGreaterThanOrEqual(startedAt.getTime() - 1000);
    expect(await activeSessions(targetId)).toHaveLength(0);
    expect(await auth.api.getSession({ headers: new Headers({ cookie: victimCookie }), query: { disableCookieCache: true } })).toBeNull();
    expect(sent.verification).toHaveLength(1);
    expect(sent.verification[0].to).toBe("moved@example.com");

    // The old reset link is refused after the change; the existing OTP guard is untouched.
    await expect(auth.api.resetPassword({ body: { newPassword: "brand-new-password-1", token: oldResetToken } })).rejects.toMatchObject({
      body: { code: "INVALID_TOKEN" },
    });
    // A link requested after the change works.
    await run(actors.root, emails.sendPasswordResetOperation, { userId: targetId });
    const newResetToken = sent.reset[1].url.match(/reset-password\/([^?]+)/)[1];
    expect(await auth.api.resetPassword({ body: { newPassword: "brand-new-password-1", token: newResetToken } })).toEqual({ status: true });
  });

  test("reset tokens without a readable creation time fail closed only when a cutoff exists", async () => {
    const context = await auth.$context;
    const cutId = await createUser({ name: "Cut", email: "cut@example.com" });
    const plainId = await createUser({ name: "Plain Two", email: "plain2@example.com" });
    await db.update(userTable).set({ passwordResetInvalidBefore: new Date() }).where(sql`${userTable.id} = ${cutId}`);
    for (const [id, token, valid] of [[cutId, "no-created-at-cut", false], [plainId, "no-created-at-plain", true]]) {
      await redis.set(`verification:reset-password:${token}`, JSON.stringify({
        id: token,
        identifier: `reset-password:${token}`,
        value: id,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }), "EX", 60);
      const attempt = auth.api.resetPassword({ body: { newPassword: "another-new-password-1", token } });
      if (valid) expect(await attempt).toEqual({ status: true });
      else await expect(attempt).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
    }
    expect(await context.internalAdapter.findVerificationValue("reset-password:no-created-at-cut")).toBeTruthy();
  });

  test("session revocation is confirmed against the store and is idempotent", async () => {
    const targetId = await createUser({ name: "Sessions", email: "sessions@example.com" });
    const first = await sessionCookie(targetId);
    const second = await sessionCookie(targetId);
    expect(await activeSessions(targetId)).toHaveLength(2);
    expect(await run(actors.root, mutations.revokeUserSessionsOperation, { userId: targetId })).toEqual({
      status: "completed",
      userId: targetId,
      selfSignedOut: false,
    });
    expect(await activeSessions(targetId)).toHaveLength(0);
    for (const { cookie } of [first, second])
      expect(await auth.api.getSession({ headers: new Headers({ cookie }), query: { disableCookieCache: true } })).toBeNull();
    expect((await run(actors.root, mutations.revokeUserSessionsOperation, { userId: targetId })).status).toBe("completed");
    // A fresh sign-in is still possible: revocation is not a ban.
    expect((await row(targetId)).banned).toBe(false);
    await denied(run(actors.moderator, mutations.revokeUserSessionsOperation, { userId: targetId }), "FORBIDDEN");
  });

  test("root revoking their own sessions reports selfSignedOut and does not run twice", async () => {
    const rootAgain = await actorFor(actors.root.id);
    const outcome = await run(rootAgain, mutations.revokeUserSessionsOperation, { userId: actors.root.id });
    expect(outcome).toEqual({ status: "completed", userId: actors.root.id, selfSignedOut: true });
    await denied(run(rootAgain, mutations.revokeUserSessionsOperation, { userId: actors.root.id }), "UNAUTHENTICATED");
    actors.root = await actorFor(actors.root.id);
  });

  test("bans: durations, replacement from execution time, permanent expiry null, revocation, unban clears state", async () => {
    const targetId = await createUser({ name: "Banned", email: "banned@example.com" });
    const { cookie } = await sessionCookie(targetId);
    await grantStepUp(actors.moderator);
    const startedAt = Date.now();
    const first = await run(actors.moderator, mutations.banUserOperation, { userId: targetId, duration: "24h", reason: "First reason" });
    expect(first).toEqual({ status: "completed", userId: targetId });
    let stored = await row(targetId);
    expect(stored.banned).toBe(true);
    expect(stored.banReason).toBe("First reason");
    expect(Math.abs(stored.banExpires.getTime() - (startedAt + 86_400_000))).toBeLessThan(5_000);
    expect(await activeSessions(targetId)).toHaveLength(0);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }), query: { disableCookieCache: true } })).toBeNull();

    // Replacement: 7 days from now, not 7 days after the previous expiry.
    const replacedAt = Date.now();
    await run(actors.moderator, mutations.banUserOperation, { userId: targetId, duration: "7d", reason: "Second reason" });
    stored = await row(targetId);
    expect(stored.banReason).toBe("Second reason");
    expect(Math.abs(stored.banExpires.getTime() - (replacedAt + 604_800_000))).toBeLessThan(5_000);

    await run(actors.moderator, mutations.banUserOperation, { userId: targetId, duration: "permanent", reason: "Permanent reason" });
    stored = await row(targetId);
    expect(stored.banExpires).toBeNull();
    const detail = await run(actors.moderator, queries.getUserOperation, { userId: targetId });
    expect(detail.accessStatus).toBe("permanently-banned");
    expect(detail.capabilities.unban.allowed).toBe(true);

    expect(await run(actors.moderator, mutations.unbanUserOperation, { userId: targetId })).toEqual({ status: "completed", userId: targetId });
    stored = await row(targetId);
    expect(stored.banned).toBe(false);
    expect(stored.banReason).toBeNull();
    expect(stored.banExpires).toBeNull();
    expect(stored.emailVerified).toBe(true);
    expect(stored.role).toBe("user");
    expect(await activeSessions(targetId)).toHaveLength(0);
    expect(sent.verification).toHaveLength(0);
    expect(await run(actors.moderator, mutations.unbanUserOperation, { userId: targetId })).toEqual({ status: "unchanged", userId: targetId });
  });

  test("an expired stored ban reads as active, and the next ban replaces its metadata", async () => {
    const targetId = await createUser({ name: "Expired", email: "expired@example.com" });
    await db.update(userTable).set({ banned: true, banReason: "old", banExpires: new Date(Date.now() - 1000) }).where(sql`${userTable.id} = ${targetId}`);
    const detail = await run(actors.root, queries.getUserOperation, { userId: targetId });
    expect(detail.accessStatus).toBe("active");
    expect(detail.banReason).toBeNull();
    expect(await run(actors.root, mutations.unbanUserOperation, { userId: targetId })).toEqual({ status: "unchanged", userId: targetId });
    const list = await run(actors.root, queries.listUsersOperation, { ...USERS_QUERY_DEFAULTS, status: "banned" });
    expect(list.items.map((item) => item.id)).not.toContain(targetId);
    await grantStepUp(actors.root);
    await run(actors.root, mutations.banUserOperation, { userId: targetId, duration: "30d", reason: "fresh ban" });
    expect((await row(targetId)).banReason).toBe("fresh ban");
  });

  test("the last effectively unbanned admin cannot be banned, including by competing bans", async () => {
    // A malformed legacy state: root lost the admin role; two other admins remain.
    await db.update(userTable).set({ role: "user" }).where(sql`${userTable.id} = ${actors.root.id}`);
    const thirdId = await createUser({ name: "Third Admin", email: "admin3@example.com", role: "admin", staffEnrolled: true });
    const third = await actorFor(thirdId);
    await grantStepUp(actors.admin);
    await grantStepUp(third);
    try {
      // Simultaneous: each bans the other. Exactly one may succeed.
      const results = await Promise.allSettled([
        run(actors.admin, mutations.banUserOperation, { userId: thirdId, duration: "24h", reason: "competing ban" }),
        run(third, mutations.banUserOperation, { userId: actors.admin.id, duration: "24h", reason: "competing ban" }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected.reason).toMatchObject({ reason: "FORBIDDEN", data: { reason: "last-admin" } });
      const admins = (await adminPool.query(`select id, banned from "user" where role = 'admin'`)).rows;
      expect(admins.filter((entry) => !entry.banned)).toHaveLength(1);

      // The loser's sessions were revoked by the ban; even a session created
      // afterwards (a legacy or malformed state) cannot ban the last admin:
      // the session authority refuses an effectively banned account outright.
      const survivorId = admins.find((entry) => !entry.banned).id;
      const bannedActor = await actorFor(survivorId === thirdId ? actors.admin.id : thirdId);
      await grantStepUp(bannedActor);
      await expect(run(bannedActor, mutations.banUserOperation, { userId: survivorId, duration: "24h", reason: "last admin" })).rejects.toMatchObject({
        reason: "UNAUTHENTICATED",
      });
      expect((await row(survivorId)).banned).toBe(false);
    } finally {
      await db.update(userTable).set({ role: "admin" }).where(sql`${userTable.id} = ${actors.root.id}`);
      await db.update(userTable).set({ banned: false, banReason: null, banExpires: null }).where(sql`${userTable.role} = 'admin'`);
      await refreshCommittedUserSessions(actors.root.id);
    }
  });

  test("direct effect failures produce truthful partial outcomes; retries keep the committed ban", async () => {
    const targetId = await createUser({ name: "Partial", email: "partial@example.com" });
    await sessionCookie(targetId);
    // Redis stops accepting deletes: the provider's queued hook logs and moves
    // on, the seam's direct delete fails and the outcome must say so.
    const originalDel = redis.del.bind(redis);
    redis.del = async () => {
      throw new Error("redis down");
    };
    await grantStepUp(actors.root);
    let outcome;
    try {
      outcome = await run(actors.root, mutations.banUserOperation, { userId: targetId, duration: "24h", reason: "partial ban" });
    } finally {
      redis.del = originalDel;
    }
    expect(outcome).toMatchObject({
      status: "partial",
      committed: true,
      effectsMayHaveApplied: true,
      failedEffects: [{ effect: "session-revocation", code: "UNAVAILABLE" }],
    });
    const stored = await row(targetId);
    expect(stored.banned).toBe(true);
    expect(await activeSessions(targetId)).toHaveLength(1);
    const expiry = stored.banExpires.getTime();
    // Recovery revokes without touching expiry or reason; step-up still applies.
    await redis.del(`stepup:grant:${actors.root.id}:${actors.root.session.id}`);
    await denied(run(actors.root, mutations.retryBanSessionsOperation, { userId: targetId }), "TWO_FACTOR_REQUIRED");
    await grantStepUp(actors.root);
    expect(await run(actors.root, mutations.retryBanSessionsOperation, { userId: targetId })).toEqual({ status: "completed", userId: targetId });
    expect((await row(targetId)).banExpires.getTime()).toBe(expiry);
    expect((await row(targetId)).banReason).toBe("partial ban");
    expect(await activeSessions(targetId)).toHaveLength(0);
    await run(actors.root, mutations.unbanUserOperation, { userId: targetId });
    await denied(run(actors.root, mutations.retryBanSessionsOperation, { userId: targetId }), "FORBIDDEN");
  });

  test("a standalone revocation that cannot be confirmed is reported as partial, not completed", async () => {
    const targetId = await createUser({ name: "Unconfirmed", email: "unconfirmed@example.com" });
    await sessionCookie(targetId);
    const originalDel = redis.del.bind(redis);
    redis.del = async () => {
      throw new Error("redis down");
    };
    let outcome;
    try {
      outcome = await run(actors.root, mutations.revokeUserSessionsOperation, { userId: targetId });
    } finally {
      redis.del = originalDel;
    }
    expect(outcome).toMatchObject({ status: "partial", committed: false, failedEffects: [{ effect: "session-revocation", code: "UNAVAILABLE" }] });
    expect((await run(actors.root, mutations.revokeUserSessionsOperation, { userId: targetId })).status).toBe("completed");
  });

  test("an email provider failure after a committed email change keeps the new address and offers recovery", async () => {
    const targetId = await createUser({ name: "Mail Fail", email: "mailfail@example.com" });
    const context = await auth.$context;
    const failing = async () => {
      throw new Error("resend down");
    };
    // Fail the provider's email dispatch for this change only.
    const originalOption = context.options.emailVerification.sendVerificationEmail;
    context.options.emailVerification.sendVerificationEmail = failing;
    await grantStepUp(actors.root);
    let outcome;
    try {
      outcome = await run(actors.root, mutations.updateUserEmailOperation, { userId: targetId, email: "mailfail-new@example.com" });
    } finally {
      context.options.emailVerification.sendVerificationEmail = originalOption;
    }
    expect(outcome).toMatchObject({
      status: "partial",
      committed: true,
      failedEffects: [{ effect: "verification-email", code: "UNAVAILABLE" }],
    });
    expect((await row(targetId)).email).toBe("mailfail-new@example.com");
    expect((await row(targetId)).emailVerified).toBe(false);
    // Recovery within the cooldown reports the wait; after it, the verification goes out.
    const retry = await run(actors.root, mutations.retryEmailChangeEffectsOperation, { userId: targetId });
    expect(retry).toMatchObject({ status: "partial", committed: false, failedEffects: [{ effect: "verification-email", code: "RATE_LIMITED" }] });
    await redis.del(`admin-email:target:verification:${targetId}`);
    expect(await run(actors.root, mutations.retryEmailChangeEffectsOperation, { userId: targetId })).toEqual({ status: "completed", userId: targetId });
    expect(sent.verification.at(-1).to).toBe("mailfail-new@example.com");
  });

  test("a Redis outage fails email throttling closed instead of sending", async () => {
    const targetId = await createUser({ name: "Outage", email: "outage@example.com", emailVerified: false });
    const original = redis.ttl.bind(redis);
    redis.ttl = async () => {
      throw new Error("redis unavailable");
    };
    try {
      await denied(run(actors.root, emails.sendVerificationOperation, { userId: targetId }), "INTERNAL");
    } finally {
      redis.ttl = original;
    }
    expect(sent.verification).toHaveLength(0);
  });

  test("provider hooks alone never confirm revocation: the seam observes the store", async () => {
    const targetId = await createUser({ name: "Seam", email: "seam@example.com" });
    await sessionCookie(targetId);
    const context = await auth.$context;
    // Both provider paths silently do nothing: a logged-but-swallowed hook
    // failure must not be reported as a confirmed revocation.
    const originalDelete = context.internalAdapter.deleteSessions;
    const originalDeleteUser = context.internalAdapter.deleteUserSessions;
    context.internalAdapter.deleteSessions = async () => {};
    context.internalAdapter.deleteUserSessions = async () => {};
    try {
      await expect(revokeCurrentUserSessions(targetId)).rejects.toThrow(/still valid/);
    } finally {
      context.internalAdapter.deleteSessions = originalDelete;
      context.internalAdapter.deleteUserSessions = originalDeleteUser;
    }
    expect((await revokeCurrentUserSessions(targetId)).revoked).toBe(1);
    expect((await revokeCurrentUserSessions(targetId)).revoked).toBe(0);
  });

  test("no feature path removes users or reaches the public admin endpoints", async () => {
    const { GET, POST } = await import("../../app/(AuthModule)/api/auth/[...all]/route.ts");
    const origin = process.env.BETTER_AUTH_URL || "http://localhost:3000";
    for (const path of ["admin/list-users", "admin/ban-user", "admin/update-user", "admin/remove-user"]) {
      const response = await POST(
        new Request(`${origin}/api/auth/${path}`, {
          method: "POST",
          headers: { origin, "content-type": "application/json", cookie: actors.root.cookie },
          body: JSON.stringify({ userId: actors.user.id }),
        }),
        { params: Promise.resolve({ all: path.split("/") }) },
      );
      expect(response.status).toBe(404);
    }
    void GET;
    const count = (await adminPool.query('select count(*)::int as n from "user"')).rows[0].n;
    expect(count).toBeGreaterThan(4);
    const source = await Promise.all(
      ["bans.ts", "emails.ts", "profile.ts", "reads.ts", "sessions.ts", "targets.ts"].map((file) =>
        Bun.file(new URL(`../../app/(AuthModule)/admin/_/db/users/${file}`, import.meta.url)).text(),
      ),
    );
    for (const text of source) {
      expect(text).not.toContain("removeUser");
      expect(text).not.toMatch(/delete\(user\)|DELETE FROM "user"/i);
    }
    expect(await db.select({ n: sql`count(*)::int` }).from(installation)).toEqual([{ n: 1 }]);
  });
});
