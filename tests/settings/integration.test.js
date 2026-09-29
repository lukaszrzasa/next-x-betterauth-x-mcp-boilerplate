import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { Pool } from "pg";
import { createOTP } from "@better-auth/utils/otp";
import { symmetricDecrypt } from "better-auth/crypto";

/**
 * The account settings against an isolated PostgreSQL database and Redis
 * database with the mailer mocked at its seam: the real guarded operations,
 * the real provider (sessions, passwords, factors, recovery codes) and the
 * real lifecycle tables. Opt-in exactly like the admin suite: TEST_DATABASE_URL
 * and TEST_REDIS_URL must name test-only services that differ from the
 * configured ones; otherwise the suite reports itself skipped.
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
  console.warn("settings integration: skipped (set TEST_DATABASE_URL and TEST_REDIS_URL to run).");
} else {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
}

const browser = new AsyncLocalStorage();
const sent = { verification: [], reset: [], otp: [], emailChange: [] };
let mailerBroken = false;
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("../../src/lib/email/index.tsx", () => ({
  EmailDeliveryError: class EmailDeliveryError extends Error {},
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
    if (mailerBroken) throw new Error("mailer down");
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

const { db, user: userTable, emailChangeRequest, authenticatorSetupRequest, twoFactor: twoFactorTable } =
  await import("../../src/lib/db/index.ts");
const { redis } = await import("../../src/lib/redis/index.ts");
const { auth } = await import("../../src/lib/auth/index.ts");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { sql, eq } = await import("drizzle-orm");
const { loadInstallationState } = await import("../../src/lib/auth/installation.ts");
const { closeAccountSecurityLockPool } = await import("../../app/(AuthModule)/_/db/security/accountLock.ts");
const { setupRootAdmin } = await import("../../app/(AuthModule)/_/operations/setup.ts");
const { resolveAuthoritativeSession } = await import("../../src/lib/auth/sessionAuthority.ts");
const { hasGrant } = await import("../../src/lib/auth/stepUp.ts");
const { loadSettingsOperations, loadAdminUserOperations } = await import("../helpers/authOperations.js");
const { profile, account, password, emailChange, emailCorrection, emailProof, authenticator, recoveryCodes, sessions } =
  await loadSettingsOperations();
const { completePasswordResetOperation } = await import("../../app/(AuthModule)/_/operations/passwordReset.ts");
const { mutations: adminMutations } = await loadAdminUserOperations();

const adminPool = configured ? new Pool({ connectionString: TEST_DATABASE_URL }) : null;
const rootInput = { name: "Root Admin", email: "root@example.com", password: "root-password-12345" };
const PASSWORD = "password-12345";
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
  return {
    entryPoint: "server-action",
    headers: new Headers({ cookie: actor.cookie, "user-agent": "TestAgent/1.0", "x-forwarded-for": "203.0.113.5" }),
    ...extra,
  };
}

/** Runs an operation with the actor's request scope (cookies for nextCookies). */
function run(actor, operation, input, extra) {
  return browser.run({ cookies: new Map(), headers: { cookie: actor.cookie } }, () =>
    operation(input, metaFor(actor, extra)),
  );
}

/** A public operation: no session, an anonymous or a foreign browser. */
function runPublic(operation, input, cookie) {
  return browser.run({ cookies: new Map(), headers: cookie ? { cookie } : {} }, () =>
    operation(input, {
      entryPoint: "server-action",
      headers: new Headers({ ...(cookie ? { cookie } : {}), "x-forwarded-for": "198.51.100.7" }),
    }),
  );
}

async function securityVersion(id) {
  const [row] = await db.select({ securityVersion: userTable.securityVersion }).from(userTable).where(eq(userTable.id, id));
  return row.securityVersion;
}

async function grantStepUp(actor) {
  await redis.set(
    `stepup:grant:${actor.id}:${actor.session.id}`,
    JSON.stringify({ verifiedAt: Date.now(), securityVersion: await securityVersion(actor.id) }),
    "EX",
    300,
  );
}

async function createUser({ name, email, role = "user", emailVerified = true }) {
  const { user } = await auth.api.createUser({
    body: { name, email, password: PASSWORD, role },
    headers: new Headers({ cookie: actors.root.cookie }),
  });
  await db.update(userTable).set({ emailVerified }).where(eq(userTable.id, user.id));
  return user.id;
}

async function actorFor(id) {
  const { session, cookie } = await sessionCookie(id);
  return { id, session, cookie };
}

async function row(id) {
  const [found] = await db.select().from(userTable).where(eq(userTable.id, id)).limit(1);
  return found ?? null;
}

async function factorSecret(userId) {
  const [factor] = await db.select().from(twoFactorTable).where(eq(twoFactorTable.userId, userId));
  return factor ? symmetricDecrypt({ key: (await auth.$context).secretConfig, data: factor.secret }) : null;
}

const codeFor = (secret) => createOTP(secret, { digits: 6, period: 30 }).totp();

/** Enrolls a real authenticator through the provider and returns its raw secret. */
async function enroll(actor, password = PASSWORD) {
  const headers = new Headers({ cookie: actor.cookie });
  await auth.api.enableTwoFactor({ body: { password, method: "totp" }, headers });
  const secret = await factorSecret(actor.id);
  const code = await codeFor(secret);
  await browser.run({ cookies: new Map(), headers: { cookie: actor.cookie } }, () =>
    auth.api.verifyTOTP({ body: { code }, headers }),
  );
  // Verification rotated the session; continue with a fresh one.
  return { secret, actor: await actorFor(actor.id) };
}

const activeSessions = async (id) => (await auth.$context).internalAdapter.listSessions(id, { onlyActiveSessions: true });
const denied = (promise, reason) => expect(promise).rejects.toMatchObject({ reason });
const lastLink = () => new URL(sent.emailChange.at(-1).url).searchParams.get("token");
const activeRequest = async (userId) =>
  (
    await db
      .select()
      .from(emailChangeRequest)
      .where(sql`${emailChangeRequest.userId} = ${userId} and ${emailChangeRequest.state} in ('awaiting_current','awaiting_new_address','awaiting_new')`)
  )[0] ?? null;

async function signIn(email, password) {
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .filter((entry) => !entry.endsWith("="))
    .join("; ");
  return { status: response.status, body: await response.json().catch(() => null), cookie };
}

describe.skipIf(!configured)("settings integration", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await adminPool.query('TRUNCATE "user" CASCADE');
    await adminPool.query("TRUNCATE installation");
    await redis.flushdb();
    await loadInstallationState();

    await browser.run({ cookies: new Map(), headers: {} }, () =>
      setupRootAdmin(rootInput, { entryPoint: "server-action", headers: new Headers() }),
    );
    const [root] = await db.select().from(userTable);
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, root.id));
    // Root's real factor, enrolled the provider's way so its step-ups can be proven.
    actors.root = (await enroll(await actorFor(root.id), rootInput.password)).actor;

    actors.alice = await actorFor(await createUser({ name: "Alice", email: "alice@example.com" }));
    actors.bob = await actorFor(await createUser({ name: "Bob", email: "bob@example.com", emailVerified: false }));
    actors.carol = await actorFor(await createUser({ name: "Carol", email: "carol@example.com" }));
    const carol = await enroll(actors.carol);
    actors.carol = carol.actor;
    actors.carol.secret = carol.secret;
  }, 90_000);

  afterAll(async () => {
    await closeAccountSecurityLockPool();
    await adminPool?.end();
    redis.disconnect();
  });

  beforeEach(async () => {
    for (const key of Object.keys(sent)) sent[key].length = 0;
    mailerBroken = false;
    for (const level of ["log", "warn", "error"]) spyOn(console, level).mockImplementation(() => {});
    // Test isolation only: throttle budgets and the TOTP replay window are
    // per-test concerns here, never disabled in the code under test.
    const keys = [
      ...(await redis.keys("settings:*")),
      ...(await redis.keys("stepup:totp-used:*")),
      // The provider's own per-IP sign-in limiter, keyed `<ip>|<path>`.
      ...(await redis.keys("*|/sign-in/email")),
    ];
    if (keys.length) await redis.del(...keys);
  });

  test("harness: the root account is enrolled with a real factor", async () => {
    expect(await row(actors.root.id)).toMatchObject({ role: "admin", twoFactorEnabled: true, emailVerified: true });
  });

  // -------------------------------------------------------------------------
  // Reads, profile, sessions
  // -------------------------------------------------------------------------

  test("reads project safe DTOs for the actor only; another account's ID is never accepted", async () => {
    const profileData = await run(actors.alice, profile.getProfileOperation, undefined);
    expect(profileData).toEqual({ name: "Alice" });
    const accountData = await run(actors.alice, account.getAccountOperation, undefined);
    expect(accountData).toEqual({
      email: "alice@example.com",
      emailVerified: true,
      twoFactorEnabled: false,
      twoFactorRequired: false,
      pendingEmail: { state: "none" },
    });
    const staff = await run(actors.root, account.getAccountOperation, undefined);
    expect(staff.twoFactorRequired).toBe(true);
    // Strict inputs: no operation takes a user ID.
    await denied(run(actors.alice, profile.updateDisplayNameOperation, { name: "X", userId: actors.bob.id }), "INVALID_INPUT");
  });

  test("display name: provider write, session copies refreshed, unchanged is a no-op, no security version change", async () => {
    const before = await securityVersion(actors.alice.id);
    expect(await run(actors.alice, profile.updateDisplayNameOperation, { name: "  Alice Liddell " })).toEqual({ status: "completed" });
    expect((await row(actors.alice.id)).name).toBe("Alice Liddell");
    const session = await resolveAuthoritativeSession(new Headers({ cookie: actors.alice.cookie }));
    expect(session.user.name).toBe("Alice Liddell");
    expect(await run(actors.alice, profile.updateDisplayNameOperation, { name: "Alice Liddell" })).toEqual({ status: "unchanged" });
    expect(await securityVersion(actors.alice.id)).toBe(before);
    expect(await run(actors.alice, profile.retryProfileSessionRefreshOperation, undefined)).toEqual({ status: "completed" });
  });

  test("sessions: projection, current first, ownership-bound revocation, others, everywhere", async () => {
    const second = await actorFor(actors.alice.id);
    const third = await actorFor(actors.alice.id);
    const page = await run(actors.alice, sessions.listSessionsOperation, { page: 1 });
    expect(page.total).toBe(3);
    expect(page.pageSize).toBe(20);
    expect(page.items[0]).toMatchObject({ id: actors.alice.session.id, isCurrent: true });
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual(["createdAt", "expiresAt", "id", "ipAddress", "isCurrent", "userAgent"]);
      expect(item).not.toHaveProperty("token");
    }
    // Page clamping and bounds.
    expect((await run(actors.alice, sessions.listSessionsOperation, { page: 99 })).page).toBe(1);
    await denied(run(actors.alice, sessions.listSessionsOperation, { page: 0 }), "INVALID_INPUT");

    // Another user's session ID revokes nothing, even when it exists.
    expect(await run(actors.bob, sessions.revokeSessionOperation, { sessionId: second.session.id })).toEqual({ status: "unchanged" });
    expect((await activeSessions(actors.alice.id)).length).toBe(3);
    // The current session cannot be revoked individually.
    expect(await run(actors.alice, sessions.revokeSessionOperation, { sessionId: actors.alice.session.id })).toEqual({ status: "unchanged" });
    expect(await run(actors.alice, sessions.revokeSessionOperation, { sessionId: second.session.id })).toEqual({ status: "completed" });
    expect((await activeSessions(actors.alice.id)).map((s) => s.id).sort()).toEqual([actors.alice.session.id, third.session.id].sort());
    expect(await run(actors.alice, sessions.revokeOtherSessionsOperation, undefined)).toEqual({ status: "completed" });
    expect((await activeSessions(actors.alice.id)).map((s) => s.id)).toEqual([actors.alice.session.id]);
    expect(await run(actors.alice, sessions.revokeOtherSessionsOperation, undefined)).toEqual({ status: "unchanged" });

    const disposable = await actorFor(actors.bob.id);
    expect(await run(disposable, sessions.revokeAllSessionsOperation, undefined)).toEqual({ status: "completed", selfSignedOut: true });
    expect(await activeSessions(actors.bob.id)).toEqual([]);
    actors.bob = await actorFor(actors.bob.id);
  });

  // -------------------------------------------------------------------------
  // Password
  // -------------------------------------------------------------------------

  test("password change: wrong password is a field error with a budget, the checkbox controls other sessions, grants die", async () => {
    const other = await actorFor(actors.alice.id);
    await denied(
      run(actors.alice, password.changePasswordOperation, { currentPassword: "wrong-password", newPassword: "new-password-12345", revokeOtherSessions: true }),
      "INVALID_INPUT",
    );
    const versionBefore = await securityVersion(actors.alice.id);
    await grantStepUp(actors.alice); // Meaningless for a non-enrolled user, but must not survive either.

    const kept = await run(actors.alice, password.changePasswordOperation, {
      currentPassword: PASSWORD,
      newPassword: "new-password-12345",
      revokeOtherSessions: false,
    });
    expect(kept).toEqual({ status: "completed" });
    expect((await activeSessions(actors.alice.id)).length).toBe(2);
    expect(await securityVersion(actors.alice.id)).toBe(versionBefore + 1);
    expect(await hasGrant({ userId: actors.alice.id, sessionId: actors.alice.session.id }, versionBefore + 1)).toBe(false);
    expect((await signIn("alice@example.com", PASSWORD)).status).not.toBe(200);
    expect((await signIn("alice@example.com", "new-password-12345")).status).toBe(200);

    const revoked = await browser.run({ cookies: new Map(), headers: { cookie: actors.alice.cookie } }, async () => {
      const result = await password.changePasswordOperation(
        { currentPassword: "new-password-12345", newPassword: PASSWORD, revokeOtherSessions: true },
        metaFor(actors.alice),
      );
      return { result, cookies: browser.getStore().cookies };
    });
    expect(revoked.result).toEqual({ status: "completed" });
    // The renewed session's cookie was forwarded; the old sessions, including `other`, are gone.
    expect([...revoked.cookies.keys()].some((key) => key.includes("session_token"))).toBe(true);
    const remaining = await activeSessions(actors.alice.id);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).not.toBe(other.session.id);
    actors.alice = await actorFor(actors.alice.id);
    for (const revokedSessionId of [other.session.id]) {
      expect(remaining.map((s) => s.id)).not.toContain(revokedSessionId);
    }
  });

  test("password change requires a verified address, and the enrolled account's step-up", async () => {
    await denied(
      run(actors.bob, password.changePasswordOperation, { currentPassword: PASSWORD, newPassword: "new-password-12345", revokeOtherSessions: true }),
      "EMAIL_VERIFICATION_REQUIRED",
    );
    await denied(
      run(actors.carol, password.changePasswordOperation, { currentPassword: PASSWORD, newPassword: "new-password-12345", revokeOtherSessions: false }),
      "TWO_FACTOR_REQUIRED",
    );
    // A real authenticator code satisfies it; the same code is spent afterwards.
    const code = await codeFor(actors.carol.secret);
    expect(
      await run(actors.carol, password.changePasswordOperation, { currentPassword: PASSWORD, newPassword: "carol-new-12345", revokeOtherSessions: false }, { stepUp: { method: "totp", code } }),
    ).toEqual({ status: "completed" });
    await denied(
      run(actors.carol, password.changePasswordOperation, { currentPassword: "carol-new-12345", newPassword: PASSWORD, revokeOtherSessions: false }, { stepUp: { method: "totp", code } }),
      "STEP_UP_INVALID_CODE",
    );
    await grantStepUp(actors.carol);
    expect(
      await run(actors.carol, password.changePasswordOperation, { currentPassword: "carol-new-12345", newPassword: PASSWORD, revokeOtherSessions: false }),
    ).toEqual({ status: "completed" });
  });

  // -------------------------------------------------------------------------
  // Verified-address change
  // -------------------------------------------------------------------------

  test("verified change: current proof, authenticated selection, new proof; links work logged out and in a foreign browser", async () => {
    const versionBefore = await securityVersion(actors.alice.id);
    const other = await actorFor(actors.alice.id);
    await denied(run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: "wrong-password" }), "INVALID_INPUT");
    expect(await activeRequest(actors.alice.id)).toBeNull();

    const begun = await run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    expect(begun.status).toBe("pending");
    expect(begun.delivery).toBe("sent");
    expect(begun.request).toMatchObject({ state: "awaiting_current", kind: "change", originalEmail: "alice@example.com" });
    expect(new Date(begun.request.expiresAt).getTime()).toBeGreaterThan(Date.now() + 23.9 * 3600 * 1000);
    expect(sent.emailChange).toHaveLength(1);
    expect(sent.emailChange[0]).toMatchObject({ to: "alice@example.com", purpose: "current" });
    const currentToken = lastLink();
    expect(currentToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await activeRequest(actors.alice.id);
    expect(stored.currentTokenHash).not.toBe(currentToken);
    expect(stored.currentTokenHash).toHaveLength(64);

    // The new-address step is refused before the current mailbox agreed.
    await denied(run(actors.alice, emailChange.selectNewEmailOperation, { requestId: begun.request.id, newEmail: "alice.new@example.com" }), "CONFLICT");

    // Inspection reads only; the row is unchanged afterwards.
    const inspected = await runPublic(emailProof.inspectEmailProofOperation, { token: currentToken });
    expect(inspected).toMatchObject({ status: "confirmable", purpose: "current", maskedEmail: expect.stringMatching(/^a•+@example\.com$/) });
    expect((await activeRequest(actors.alice.id)).state).toBe("awaiting_current");

    // Confirmed while signed in as Bob: Bob is untouched, the request moves on.
    const bobBefore = await row(actors.bob.id);
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token: currentToken }, actors.bob.cookie)).toEqual({ status: "current-confirmed" });
    expect(await row(actors.bob.id)).toEqual(bobBefore);
    expect((await row(actors.alice.id)).email).toBe("alice@example.com");
    const afterCurrent = await activeRequest(actors.alice.id);
    expect(afterCurrent.state).toBe("awaiting_new_address");
    expect(afterCurrent.currentTokenHash).toBeNull();
    expect(afterCurrent.currentConfirmedAt).not.toBeNull();
    // Consumed: replay is an inactive link.
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token: currentToken })).toEqual({ status: "inactive" });

    const status = await run(actors.alice, account.getAccountOperation, undefined);
    expect(status.pendingEmail).toMatchObject({ state: "awaiting_new_address", id: begun.request.id });

    // Selection from another device signed in as Alice; no password repeated.
    await denied(run(other, emailChange.selectNewEmailOperation, { requestId: begun.request.id, newEmail: "alice@example.com" }), "INVALID_INPUT");
    await denied(run(other, emailChange.selectNewEmailOperation, { requestId: begun.request.id, newEmail: "bob@example.com" }), "CONFLICT");
    const selected = await run(other, emailChange.selectNewEmailOperation, { requestId: begun.request.id, newEmail: "Alice.New@example.com" });
    expect(selected.request).toMatchObject({ state: "awaiting_new", newEmail: "alice.new@example.com" });
    expect(sent.emailChange.at(-1)).toMatchObject({ to: "alice.new@example.com", purpose: "new" });
    const firstNewToken = lastLink();
    // The destination is fixed.
    await denied(run(other, emailChange.selectNewEmailOperation, { requestId: begun.request.id, newEmail: "third@example.com" }), "CONFLICT");

    // A resend replaces the link without moving the deadline.
    await redis.del(`settings:email-send:${actors.alice.id}:new`);
    const resent = await run(actors.alice, emailChange.resendEmailRequestOperation, { requestId: begun.request.id });
    expect(resent.request.expiresAt).toBe(begun.request.expiresAt);
    const secondNewToken = lastLink();
    expect(secondNewToken).not.toBe(firstNewToken);
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token: firstNewToken })).toEqual({ status: "inactive" });
    expect((await activeRequest(actors.alice.id)).newTokenGeneration).toBe(2);

    // Final proof, anonymous: account committed, sessions revoked and confirmed.
    const resetCutoffBefore = (await row(actors.alice.id)).passwordResetInvalidBefore;
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token: secondNewToken })).toEqual({ status: "completed", sessionRevocationPending: false });
    const changed = await row(actors.alice.id);
    expect(changed.email).toBe("alice.new@example.com");
    expect(changed.emailVerified).toBe(true);
    expect(changed.securityVersion).toBe(versionBefore + 1);
    expect(changed.sessionRevocationPending).toBe(false);
    expect(changed.passwordResetInvalidBefore).not.toEqual(resetCutoffBefore);
    expect(changed.role).toBe("user");
    expect(await activeSessions(actors.alice.id)).toEqual([]);
    const [completed] = await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, begun.request.id));
    expect(completed).toMatchObject({ state: "completed", currentTokenHash: null, newTokenHash: null, sessionRevocationPending: false });
    expect(completed.completedAt).not.toBeNull();
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token: secondNewToken })).toEqual({ status: "inactive" });
    expect(await runPublic(emailProof.inspectEmailProofOperation, { token: secondNewToken })).toEqual({ status: "inactive" });
    expect((await signIn("alice.new@example.com", PASSWORD)).status).toBe(200);
    actors.alice = await actorFor(actors.alice.id);
  });

  test("only one active request: a new start replaces the old one, cancel is explicit and idempotent, wrong password cancels nothing", async () => {
    const first = await run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    const firstToken = lastLink();
    await denied(run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: "wrong-password" }), "INVALID_INPUT");
    expect((await activeRequest(actors.alice.id)).id).toBe(first.request.id);
    await redis.del(`settings:email-send:${actors.alice.id}:current`);
    const second = await run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    expect(second.request.id).not.toBe(first.request.id);
    const [replaced] = await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, first.request.id));
    expect(replaced).toMatchObject({ state: "cancelled", cancelReason: "replaced", currentTokenHash: null });
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token: firstToken })).toEqual({ status: "inactive" });

    // Cancel: no proof needed; the other user's ID cancels nothing.
    expect(await run(actors.bob, emailChange.cancelEmailRequestOperation, { requestId: second.request.id })).toEqual({ status: "unchanged" });
    expect(await run(actors.alice, emailChange.cancelEmailRequestOperation, { requestId: second.request.id })).toEqual({ status: "completed" });
    expect(await run(actors.alice, emailChange.cancelEmailRequestOperation, { requestId: second.request.id })).toEqual({ status: "unchanged" });
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token: lastLink() })).toEqual({ status: "inactive" });
    expect((await run(actors.alice, account.getAccountOperation, undefined)).pendingEmail).toEqual({ state: "none" });
  });

  test("the deadline is absolute: at expiresAt nothing confirms, sends or selects; the read marks the row expired", async () => {
    await redis.del(`settings:email-send:${actors.alice.id}:current`);
    const begun = await run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    const token = lastLink();
    await db.update(emailChangeRequest).set({ expiresAt: new Date() }).where(eq(emailChangeRequest.id, begun.request.id));
    expect(await runPublic(emailProof.inspectEmailProofOperation, { token })).toEqual({ status: "expired" });
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token })).toEqual({ status: "expired" });
    await redis.del(`settings:email-send:${actors.alice.id}:current`);
    await denied(run(actors.alice, emailChange.resendEmailRequestOperation, { requestId: begun.request.id }), "NOT_FOUND");
    const [expired] = await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, begun.request.id));
    expect(expired).toMatchObject({ state: "expired", currentTokenHash: null });
    expect((await run(actors.alice, account.getAccountOperation, undefined)).pendingEmail).toEqual({ state: "none" });
  });

  test("delivery is reported honestly: a mail failure keeps the request and the charge; the send cooldown counts down", async () => {
    mailerBroken = true;
    await redis.del(`settings:email-send:${actors.alice.id}:current`);
    const begun = await run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    expect(begun.delivery).toBe("failed");
    expect((await activeRequest(actors.alice.id)).state).toBe("awaiting_current");
    mailerBroken = false;
    const blocked = await run(actors.alice, emailChange.resendEmailRequestOperation, { requestId: begun.request.id }).catch((error) => error);
    expect(blocked).toMatchObject({ reason: "RATE_LIMITED" });
    expect(blocked.data.retryAfterSeconds).toBeGreaterThan(0);
    await redis.del(`settings:email-send:${actors.alice.id}:current`);
    expect((await run(actors.alice, emailChange.resendEmailRequestOperation, { requestId: begun.request.id })).delivery).toBe("sent");
    await run(actors.alice, emailChange.cancelEmailRequestOperation, { requestId: begun.request.id });
  });

  test("a password change retires the pending request; a public reset completion does too and honours the cutoff", async () => {
    await redis.del(`settings:email-send:${actors.alice.id}:current`);
    const begun = await run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    const token = lastLink();
    expect(await run(actors.alice, password.changePasswordOperation, { currentPassword: PASSWORD, newPassword: "alice-two-12345", revokeOtherSessions: false })).toEqual({ status: "completed" });
    const [cancelled] = await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, begun.request.id));
    expect(cancelled).toMatchObject({ state: "cancelled", cancelReason: "credentials", currentTokenHash: null });
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token })).toEqual({ status: "inactive" });

    // Public reset: the real provider token, completed through the guarded operation.
    await redis.del(`settings:email-send:${actors.alice.id}:current`);
    const again = await run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: "alice-two-12345" });
    await auth.api.requestPasswordReset({ body: { email: "alice.new@example.com", redirectTo: "/auth/reset-password" } });
    const resetToken = new URL(sent.reset.at(-1).url).pathname.split("/").pop();
    await denied(runPublic(completePasswordResetOperation, { token: "not-a-token", newPassword: "alice-three-12345" }), "FORBIDDEN");
    expect(await runPublic(completePasswordResetOperation, { token: resetToken, newPassword: "alice-three-12345" })).toEqual({ status: "completed" });
    expect(await activeSessions(actors.alice.id)).toEqual([]);
    expect((await signIn("alice.new@example.com", "alice-three-12345")).status).toBe(200);
    const [byReset] = await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, again.request.id));
    expect(byReset).toMatchObject({ state: "cancelled", cancelReason: "credentials" });
    // Single use.
    await denied(runPublic(completePasswordResetOperation, { token: resetToken, newPassword: "alice-four-12345" }), "FORBIDDEN");

    // A reset link issued before an administrative email change is refused.
    actors.alice = await actorFor(actors.alice.id);
    await auth.api.requestPasswordReset({ body: { email: "alice.new@example.com", redirectTo: "/auth/reset-password" } });
    const staleToken = new URL(sent.reset.at(-1).url).pathname.split("/").pop();
    await db.update(userTable).set({ passwordResetInvalidBefore: new Date(Date.now() + 1000) }).where(eq(userTable.id, actors.alice.id));
    await denied(runPublic(completePasswordResetOperation, { token: staleToken, newPassword: "alice-five-12345" }), "FORBIDDEN");
    await db.update(userTable).set({ passwordResetInvalidBefore: null }).where(eq(userTable.id, actors.alice.id));
    await run(actors.alice, password.changePasswordOperation, { currentPassword: "alice-three-12345", newPassword: PASSWORD, revokeOtherSessions: false });
  });

  test("an administrative email change retires the pending request", async () => {
    await redis.del(`settings:email-send:${actors.alice.id}:current`);
    const begun = await run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    const token = lastLink();
    await grantStepUp(actors.root);
    const outcome = await run(actors.root, adminMutations.updateUserEmailOperation, { userId: actors.alice.id, email: "alice.admin@example.com" });
    expect(outcome.status).not.toBe("unchanged");
    const [cancelled] = await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, begun.request.id));
    expect(cancelled).toMatchObject({ state: "cancelled", cancelReason: "admin_change" });
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token })).toEqual({ status: "inactive" });
    // Restore a verified, sessioned Alice for later tests.
    await db.update(userTable).set({ email: "alice@example.com", emailVerified: true }).where(eq(userTable.id, actors.alice.id));
    actors.alice = await actorFor(actors.alice.id);
  });

  test("a committed change whose revocation was interrupted is reconciled by the session authority before any session is honoured", async () => {
    const version = await securityVersion(actors.alice.id);
    const other = await actorFor(actors.alice.id);
    await db.update(userTable).set({ sessionRevocationPending: true }).where(eq(userTable.id, actors.alice.id));
    // The barrier refuses the session and revokes every session, then clears itself for that generation.
    expect(await resolveAuthoritativeSession(new Headers({ cookie: other.cookie }))).toBeNull();
    expect(await activeSessions(actors.alice.id)).toEqual([]);
    expect((await row(actors.alice.id)).sessionRevocationPending).toBe(false);
    expect(await securityVersion(actors.alice.id)).toBe(version);
    await denied(run(other, profile.getProfileOperation, undefined), "UNAUTHENTICATED");
    // A newer generation keeps its own barrier: the conditional clear affects nothing.
    await db.update(userTable).set({ sessionRevocationPending: true, securityVersion: version + 5 }).where(eq(userTable.id, actors.alice.id));
    const stale = await actorFor(actors.alice.id);
    await db.update(userTable).set({ securityVersion: version + 6 }).where(eq(userTable.id, actors.alice.id));
    const { clearRevocationBarrier } = await import("../../src/lib/auth/sessionAuthority.ts");
    expect(await clearRevocationBarrier(actors.alice.id, version + 5)).toEqual({ cleared: false });
    expect((await row(actors.alice.id)).sessionRevocationPending).toBe(true);
    expect(await resolveAuthoritativeSession(new Headers({ cookie: stale.cookie }))).toBeNull();
    expect((await row(actors.alice.id)).sessionRevocationPending).toBe(false);
    actors.alice = await actorFor(actors.alice.id);
  });

  // -------------------------------------------------------------------------
  // Unverified-address correction
  // -------------------------------------------------------------------------

  test("correction: password only for a non-enrolled account, mail to the corrected address only, one proof commits", async () => {
    await denied(run(actors.alice, emailCorrection.beginEmailCorrectionOperation, { currentPassword: PASSWORD, newEmail: "x@example.com" }), "CONFLICT");
    await denied(run(actors.bob, emailCorrection.beginEmailCorrectionOperation, { currentPassword: PASSWORD, newEmail: "bob.right@example.com", authenticatorCode: "123456" }), "INVALID_INPUT");
    const begun = await run(actors.bob, emailCorrection.beginEmailCorrectionOperation, { currentPassword: PASSWORD, newEmail: "bob.right@example.com" });
    expect(begun.request).toMatchObject({ state: "awaiting_new", kind: "correction", originalEmail: "bob@example.com", newEmail: "bob.right@example.com" });
    expect(sent.emailChange.map((message) => message.to)).toEqual(["bob.right@example.com"]);
    expect(sent.otp).toEqual([]);
    const stored = await activeRequest(actors.bob.id);
    expect(stored.currentConfirmedAt).toBeNull();
    expect(stored.currentTokenHash).toBeNull();
    const token = lastLink();
    expect(await runPublic(emailProof.inspectEmailProofOperation, { token })).toMatchObject({ status: "confirmable", purpose: "new" });
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token })).toEqual({ status: "completed", sessionRevocationPending: false });
    const bob = await row(actors.bob.id);
    expect(bob).toMatchObject({ email: "bob.right@example.com", emailVerified: true });
    expect(await activeSessions(actors.bob.id)).toEqual([]);
    actors.bob = await actorFor(actors.bob.id);
  });

  test("correction for an enrolled unverified account needs a fresh authenticator code and never an emailed one", async () => {
    await db.update(userTable).set({ emailVerified: false }).where(eq(userTable.id, actors.carol.id));
    try {
    await denied(run(actors.carol, emailCorrection.beginEmailCorrectionOperation, { currentPassword: PASSWORD, newEmail: "carol.right@example.com" }), "INVALID_INPUT");
    await denied(run(actors.carol, emailCorrection.beginEmailCorrectionOperation, { currentPassword: PASSWORD, newEmail: "carol.right@example.com", authenticatorCode: "000000" }), "STEP_UP_INVALID_CODE");
    // The ordinary change flow refuses an unverified address; the step-up would be unavailable anyway.
    await denied(run(actors.carol, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD }), "EMAIL_VERIFICATION_REQUIRED");
    const code = await codeFor(actors.carol.secret);
    const begun = await run(actors.carol, emailCorrection.beginEmailCorrectionOperation, { currentPassword: PASSWORD, newEmail: "carol.right@example.com", authenticatorCode: code });
    expect(begun.request.state).toBe("awaiting_new");
    expect(sent.otp).toEqual([]);
    // The one-time proof created no reusable grant.
    expect(await hasGrant({ userId: actors.carol.id, sessionId: actors.carol.session.id }, await securityVersion(actors.carol.id))).toBe(false);
    const token = lastLink();

    // The ordinary verification of the original address wins first: the correction is cancelled.
    await auth.api.sendVerificationEmail({ body: { email: "carol@example.com" } });
    const verifyToken = new URL(sent.verification.at(-1).url).searchParams.get("token");
    const verified = await auth.handler(new Request(`http://localhost:3000/api/auth/verify-email?token=${verifyToken}`));
    expect(verified.status).toBe(200);
    expect((await row(actors.carol.id)).emailVerified).toBe(true);
    const [cancelled] = await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, begun.request.id));
    expect(cancelled).toMatchObject({ state: "cancelled", cancelReason: "account_changed" });
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token })).toEqual({ status: "inactive" });
    expect((await row(actors.carol.id)).email).toBe("carol@example.com");
    } finally {
      await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, actors.carol.id));
    }
  });

  test("a verified original address defeats a correction proof even when the cancellation was missed; a taken destination never redirects", async () => {
    // A correction row for Bob's account whose address is meanwhile verified, as if the hook had been lost.
    await db.update(userTable).set({ emailVerified: false }).where(eq(userTable.id, actors.bob.id));
    const begun = await run(actors.bob, emailCorrection.beginEmailCorrectionOperation, { currentPassword: PASSWORD, newEmail: "bob.other@example.com" });
    const token = lastLink();
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, actors.bob.id));
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token })).toEqual({ status: "account-changed" });
    expect((await row(actors.bob.id)).email).toBe("bob.right@example.com");
    const [cancelled] = await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, begun.request.id));
    expect(cancelled.state).toBe("cancelled");

    // Two accounts race for one address: PostgreSQL decides, the loser's account is untouched.
    await redis.del(`settings:email-send:${actors.alice.id}:current`);
    await redis.del(`settings:email-send:${actors.alice.id}:new`);
    const aliceRequest = await run(actors.alice, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    const aliceCurrent = lastLink();
    await runPublic(emailProof.confirmEmailProofOperation, { token: aliceCurrent });
    await run(actors.alice, emailChange.selectNewEmailOperation, { requestId: aliceRequest.request.id, newEmail: "shared@example.com" });
    const aliceNew = lastLink();
    const dave = await actorFor(await createUser({ name: "Dave", email: "dave@example.com", emailVerified: false }));
    await run(dave, emailCorrection.beginEmailCorrectionOperation, { currentPassword: PASSWORD, newEmail: "shared@example.com" });
    const daveNew = lastLink();
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token: daveNew })).toMatchObject({ status: "completed" });
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token: aliceNew })).toEqual({ status: "destination-unavailable" });
    expect((await row(actors.alice.id)).email).toBe("alice@example.com");
    expect((await row(dave.id)).email).toBe("shared@example.com");
    actors.alice = await actorFor(actors.alice.id);
  });

  test("public proofs are throttled per request and per address for invalid tokens; nothing leaks", async () => {
    const fake = "A".repeat(43);
    for (let i = 0; i < 60; i++) expect(await runPublic(emailProof.confirmEmailProofOperation, { token: fake })).toEqual({ status: "inactive" });
    await denied(runPublic(emailProof.confirmEmailProofOperation, { token: fake }), "RATE_LIMITED");
    await denied(runPublic(emailProof.confirmEmailProofOperation, { token: "short" }), "INVALID_INPUT");
  });

  // -------------------------------------------------------------------------
  // Authenticator
  // -------------------------------------------------------------------------

  test("optional enrollment: the factor stays inactive until the new code is proven; codes are issued once; login then challenges", async () => {
    const unverified = await actorFor(await createUser({ name: "Eve", email: "eve@example.com", emailVerified: false }));
    await denied(run(unverified, authenticator.beginEnrollmentOperation, { currentPassword: PASSWORD }), "EMAIL_VERIFICATION_REQUIRED");
    await denied(run(actors.alice, authenticator.beginEnrollmentOperation, { currentPassword: "wrong-password" }), "INVALID_INPUT");
    const started = await run(actors.alice, authenticator.beginEnrollmentOperation, { currentPassword: PASSWORD });
    expect(started).toMatchObject({ status: "pending", kind: "enroll" });
    expect(started.totpUri).toStartWith("otpauth://totp/");
    expect(new URL(started.totpUri).searchParams.get("secret")).toBe(started.manualKey);
    expect((await row(actors.alice.id)).twoFactorEnabled).toBe(false);
    const [factor] = await db.select().from(twoFactorTable).where(eq(twoFactorTable.userId, actors.alice.id));
    expect(factor.verified).toBe(false);
    // Not yet a factor: a login needs no challenge.
    expect((await signIn("alice@example.com", PASSWORD)).body?.twoFactorRedirect).toBeUndefined();

    await denied(run(actors.alice, authenticator.confirmEnrollmentOperation, { requestId: started.requestId, code: "000000" }), "INVALID_INPUT");
    // Another session cannot finish this attempt.
    const stranger = await actorFor(actors.alice.id);
    await denied(run(stranger, authenticator.confirmEnrollmentOperation, { requestId: started.requestId, code: await codeFor(await factorSecret(actors.alice.id)) }), "CONFLICT");
    // A restart replaces the attempt and its unverified row.
    const restarted = await run(actors.alice, authenticator.beginEnrollmentOperation, { currentPassword: PASSWORD });
    expect(restarted.requestId).not.toBe(started.requestId);
    await denied(run(actors.alice, authenticator.confirmEnrollmentOperation, { requestId: started.requestId, code: "123456" }), "CONFLICT");

    const secret = await factorSecret(actors.alice.id);
    const issued = await run(actors.alice, authenticator.confirmEnrollmentOperation, { requestId: restarted.requestId, code: await codeFor(secret) });
    expect(issued.status).toBe("completed");
    expect(issued.recoveryCodes).toHaveLength(10);
    expect(issued.recoveryCodes.every((code) => /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/.test(code))).toBe(true);
    expect((await row(actors.alice.id)).twoFactorEnabled).toBe(true);
    const [setup] = await db.select().from(authenticatorSetupRequest).where(eq(authenticatorSetupRequest.id, restarted.requestId));
    expect(setup.state).toBe("completed");
    // The provider now challenges the login, and a recovery code from this exact set signs in.
    const login = await signIn("alice@example.com", PASSWORD);
    expect(login.body.twoFactorRedirect).toBe(true);
    const challengeCookie = login.cookie;
    const recovered = await auth.handler(
      new Request("http://localhost:3000/api/auth/two-factor/verify-backup-code", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json", cookie: challengeCookie },
        body: JSON.stringify({ code: issued.recoveryCodes[0] }),
      }),
    );
    expect(recovered.status).toBe(200);
    actors.alice = await actorFor(actors.alice.id);
    actors.alice.secret = secret;
  });

  test("replacement keeps the old authenticator and codes working until the new code is proven, then swaps both atomically", async () => {
    const oldSecret = actors.carol.secret;
    await denied(run(actors.carol, authenticator.beginReplacementOperation, { currentPassword: PASSWORD }), "TWO_FACTOR_REQUIRED");
    await grantStepUp(actors.carol);
    const started = await run(actors.carol, authenticator.beginReplacementOperation, { currentPassword: PASSWORD });
    expect(started).toMatchObject({ status: "pending", kind: "replace" });
    const newSecret = Buffer.from(
      (await import("@better-auth/utils/base32")).base32.decode(started.manualKey),
    ).toString();
    // Old factor still verifies with the provider; the old recovery set is untouched.
    expect((await factorSecret(actors.carol.id))).toBe(oldSecret);
    const [beforeRow] = await db.select().from(twoFactorTable).where(eq(twoFactorTable.userId, actors.carol.id));

    // A code from the *old* authenticator does not complete the replacement.
    await denied(run(actors.carol, authenticator.confirmReplacementOperation, { requestId: started.requestId, code: await codeFor(oldSecret) }), "INVALID_INPUT");
    // Cancel leaves everything as it was; a cancelled attempt cannot be completed.
    expect(await run(actors.carol, authenticator.cancelSetupOperation, { requestId: started.requestId })).toEqual({ status: "completed" });
    await denied(run(actors.carol, authenticator.confirmReplacementOperation, { requestId: started.requestId, code: await codeFor(newSecret) }), "CONFLICT");
    const [afterCancel] = await db.select().from(twoFactorTable).where(eq(twoFactorTable.userId, actors.carol.id));
    expect(afterCancel).toEqual(beforeRow);

    // Again, and complete it with the new code.
    await grantStepUp(actors.carol);
    const again = await run(actors.carol, authenticator.beginReplacementOperation, { currentPassword: PASSWORD });
    const nextSecret = Buffer.from((await import("@better-auth/utils/base32")).base32.decode(again.manualKey)).toString();
    const versionBefore = await securityVersion(actors.carol.id);
    const issued = await run(actors.carol, authenticator.confirmReplacementOperation, { requestId: again.requestId, code: await codeFor(nextSecret) });
    expect(issued.status).toBe("completed");
    expect(issued.recoveryCodes).toHaveLength(10);
    expect(await factorSecret(actors.carol.id)).toBe(nextSecret);
    const [afterRow] = await db.select().from(twoFactorTable).where(eq(twoFactorTable.userId, actors.carol.id));
    expect(afterRow.verified).toBe(true);
    expect(afterRow.id).toBe(beforeRow.id);
    expect((await row(actors.carol.id)).twoFactorEnabled).toBe(true);
    expect(await securityVersion(actors.carol.id)).toBe(versionBefore + 1);
    expect(await hasGrant({ userId: actors.carol.id, sessionId: actors.carol.session.id }, versionBefore + 1)).toBe(false);
    // The attempt is closed: even with a fresh existing-factor grant the same new code completes nothing.
    await grantStepUp(actors.carol);
    await denied(run(actors.carol, authenticator.confirmReplacementOperation, { requestId: again.requestId, code: await codeFor(nextSecret) }), "CONFLICT");

    // Provider interoperability: the old factor's codes fail at login, the new ones and the new recovery codes work.
    const login = await signIn("carol@example.com", PASSWORD);
    expect(login.body.twoFactorRedirect).toBe(true);
    const challenge = login.cookie;
    const post = (path, body, cookie) =>
      auth.handler(new Request(`http://localhost:3000/api/auth/${path}`, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", cookie }, body: JSON.stringify(body) }));
    expect((await post("two-factor/verify-totp", { code: await codeFor(oldSecret) }, challenge)).status).not.toBe(200);
    expect((await post("two-factor/verify-totp", { code: await codeFor(nextSecret) }, challenge)).status).toBe(200);
    const secondLogin = await signIn("carol@example.com", PASSWORD);
    expect((await post("two-factor/verify-backup-code", { code: issued.recoveryCodes[3] }, secondLogin.cookie)).status).toBe(200);
    const thirdLogin = await signIn("carol@example.com", PASSWORD);
    expect((await post("two-factor/verify-backup-code", { code: issued.recoveryCodes[3] }, thirdLogin.cookie)).status).not.toBe(200);
    actors.carol.secret = nextSecret;
  });

  test("recovery-code regeneration replaces the set through the provider; disabling honours policy", async () => {
    await grantStepUp(actors.carol);
    const issued = await run(actors.carol, recoveryCodes.regenerateRecoveryCodesOperation, { currentPassword: PASSWORD });
    expect(issued.status).toBe("completed");
    expect(issued.recoveryCodes).toHaveLength(10);
    const [factor] = await db.select().from(twoFactorTable).where(eq(twoFactorTable.userId, actors.carol.id));
    const storedCodes = JSON.parse(await symmetricDecrypt({ key: (await auth.$context).secretConfig, data: factor.backupCodes }));
    expect(storedCodes).toEqual(issued.recoveryCodes);
    // The grant was spent by the regeneration.
    await denied(run(actors.carol, recoveryCodes.regenerateRecoveryCodesOperation, { currentPassword: PASSWORD }), "TWO_FACTOR_REQUIRED");

    // Root is required to keep a factor: never disableable, whatever the stored flag says.
    await grantStepUp(actors.root);
    await denied(run(actors.root, authenticator.disableAuthenticatorOperation, { currentPassword: rootInput.password }), "FORBIDDEN");
    await db.update(userTable).set({ twoFactorRequired: false }).where(eq(userTable.id, actors.root.id));
    await grantStepUp(actors.root);
    await denied(run(actors.root, authenticator.disableAuthenticatorOperation, { currentPassword: rootInput.password }), "FORBIDDEN");
    await db.update(userTable).set({ twoFactorRequired: true }).where(eq(userTable.id, actors.root.id));
    expect((await row(actors.root.id)).twoFactorEnabled).toBe(true);

    // An ordinary account disables through the provider; its sessions stay signed in.
    const aliceOther = await actorFor(actors.alice.id);
    await grantStepUp(actors.alice);
    const disabled = await browser.run({ cookies: new Map(), headers: { cookie: actors.alice.cookie } }, () =>
      authenticator.disableAuthenticatorOperation({ currentPassword: PASSWORD }, metaFor(actors.alice)),
    );
    expect(disabled).toEqual({ status: "completed" });
    expect((await row(actors.alice.id)).twoFactorEnabled).toBe(false);
    expect(await db.select().from(twoFactorTable).where(eq(twoFactorTable.userId, actors.alice.id))).toEqual([]);
    expect((await activeSessions(actors.alice.id)).map((s) => s.id)).toContain(aliceOther.session.id);
    expect(await run(aliceOther, authenticator.retryFactorSessionRefreshOperation, undefined)).toEqual({ status: "completed" });
    expect(await run(aliceOther, authenticator.disableAuthenticatorOperation, { currentPassword: PASSWORD })).toEqual({ status: "unchanged" });
  });

  // The wait itself (an operation queued behind the lock while the generation moves) is in coordination.test.js.
  test("a grant issued for an earlier security generation admits nothing: the pipeline asks for a new proof", async () => {
    const stale = await actorFor(actors.carol.id);
    await grantStepUp(stale);
    // Something moves the generation on between the grant and the operation.
    await db.update(userTable).set({ securityVersion: sql`${userTable.securityVersion} + 1` }).where(eq(userTable.id, actors.carol.id));
    await denied(run(stale, recoveryCodes.regenerateRecoveryCodesOperation, { currentPassword: PASSWORD }), "TWO_FACTOR_REQUIRED");
  });
});
