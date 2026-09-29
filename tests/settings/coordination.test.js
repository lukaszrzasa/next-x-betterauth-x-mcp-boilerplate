import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac } from "node:crypto";
import { Pool } from "pg";
import { createOTP } from "@better-auth/utils/otp";
import { symmetricDecrypt } from "better-auth/crypto";
import { z } from "zod";

/**
 * What coordinates what, against an isolated PostgreSQL database and Redis
 * database, with the real provider: which operations take the account
 * security lock and which never wait for it, the conditional writes that
 * replaced it for the request transitions, and the atomic commits that
 * remain. Interleavings are arranged with connections this suite controls
 * and observed in `pg_locks`; nothing here depends on timing.
 *
 * Opt-in like the other integration suites: TEST_DATABASE_URL and
 * TEST_REDIS_URL must name test-only services that differ from the
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
  console.warn("settings coordination: skipped (set TEST_DATABASE_URL and TEST_REDIS_URL to run).");
} else {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
}

const browser = new AsyncLocalStorage();
const sent = { emailChange: [] };
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("../../src/lib/email/index.tsx", () => ({
  EmailDeliveryError: class EmailDeliveryError extends Error {},
  sendVerificationEmail: async () => {},
  sendPasswordResetEmail: async () => {},
  sendTwoFactorOtpEmail: async () => {},
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

const { db, user: userTable, emailChangeRequest, authenticatorSetupRequest, twoFactor: twoFactorTable } =
  await import("../../src/lib/db/index.ts");
const { redis } = await import("../../src/lib/redis/index.ts");
const { auth } = await import("../../src/lib/auth/index.ts");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { eq } = await import("drizzle-orm");
const { loadInstallationState } = await import("../../src/lib/auth/installation.ts");
const { defineAction } = await import("../../src/lib/auth/builders/actionBuilder.ts");
const { closeAccountSecurityLockPool } = await import("../../app/(AuthModule)/_/db/security/accountLock.ts");
const transitions = await import("../../app/(AuthModule)/_/db/emailRequests/transitions.ts");
const { swapFactor } = await import("../../app/(AuthModule)/_/db/authenticator/factorSwap.ts");
const { setupRootAdmin } = await import("../../app/(AuthModule)/_/operations/setup.ts");
const { loadSettingsOperations, loadAdminUserOperations } = await import("../helpers/authOperations.js");
const { profile, emailChange, emailProof, authenticator, recoveryCodes, sessions } = await loadSettingsOperations();
const { mutations: admin } = await loadAdminUserOperations();

const adminPool = configured ? new Pool({ connectionString: TEST_DATABASE_URL }) : null;
const rootInput = { name: "Root Admin", email: "root@example.com", password: "root-password-12345" };
const PASSWORD = "password-12345";
const actors = {};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

async function actorFor(id) {
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(id);
  const signature = createHmac("sha256", context.secret).update(session.token).digest("base64");
  return { id, session, cookie: `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}` };
}

const metaFor = (actor) => ({
  entryPoint: "server-action",
  headers: new Headers({ cookie: actor.cookie, "user-agent": "TestAgent/1.0", "x-forwarded-for": "203.0.113.5" }),
});

function run(actor, operation, input) {
  return browser.run({ cookies: new Map(), headers: { cookie: actor.cookie } }, () => operation(input, metaFor(actor)));
}

function runPublic(operation, input) {
  return browser.run({ cookies: new Map(), headers: {} }, () =>
    operation(input, { entryPoint: "server-action", headers: new Headers({ "x-forwarded-for": "198.51.100.7" }) }),
  );
}

/** A genuine context of the actor, for calling a persistence function directly. */
const withContext = defineAction({
  name: "test.coordination.persistence",
  schema: z.custom((value) => typeof value === "function"),
  handler: (ctx, work) => work(ctx),
});
const persist = (actor, work) => run(actor, withContext, work);

async function createUser({ name, email }) {
  const { user } = await auth.api.createUser({
    body: { name, email, password: PASSWORD, role: "user" },
    headers: new Headers({ cookie: actors.root.cookie }),
  });
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
  return actorFor(user.id);
}

const row = async (id) => (await db.select().from(userTable).where(eq(userTable.id, id)).limit(1))[0] ?? null;
const requestRow = async (id) => (await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, id)))[0];
const setupRow = async (id) =>
  (await db.select().from(authenticatorSetupRequest).where(eq(authenticatorSetupRequest.id, id)))[0];
const factorRow = async (userId) => (await db.select().from(twoFactorTable).where(eq(twoFactorTable.userId, userId)))[0];
const activeSessions = async (id) => (await auth.$context).internalAdapter.listSessions(id, { onlyActiveSessions: true });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const tokenOf = (message) => new URL(message.url).searchParams.get("token");
const codeFor = (secret) => createOTP(secret, { digits: 6, period: 30 }).totp();

async function grantStepUp(actor) {
  const { securityVersion } = await row(actor.id);
  await redis.set(
    `stepup:grant:${actor.id}:${actor.session.id}`,
    JSON.stringify({ verifiedAt: Date.now(), securityVersion }),
    "EX",
    300,
  );
}

/** Enrolls a real authenticator through the provider; verification rotates the session. */
async function enroll(actor) {
  const headers = new Headers({ cookie: actor.cookie });
  await auth.api.enableTwoFactor({ body: { password: PASSWORD, method: "totp" }, headers });
  const secret = await symmetricDecrypt({ key: (await auth.$context).secretConfig, data: (await factorRow(actor.id)).secret });
  const code = await codeFor(secret);
  await browser.run({ cookies: new Map(), headers: { cookie: actor.cookie } }, () =>
    auth.api.verifyTOTP({ body: { code }, headers }),
  );
  return actorFor(actor.id);
}

/** A change request of `actor` that reached `awaiting_new_address`, with its mail cooldowns lifted. */
async function requestAwaitingAddress(actor) {
  await liftCooldowns(actor);
  const begun = await run(actor, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
  expect(await runPublic(emailProof.confirmEmailProofOperation, { token: tokenOf(sent.emailChange.at(-1)) })).toEqual({
    status: "current-confirmed",
  });
  await liftCooldowns(actor);
  return begun.request.id;
}

const liftCooldowns = (actor) =>
  redis.del(`settings:email-send:${actor.id}:current`, `settings:email-send:${actor.id}:new`);

// ---------------------------------------------------------------------------
// Controlled connections
// ---------------------------------------------------------------------------

/** The account security lock's key, as `db/security/accountLock.ts` takes it. */
const SECURITY_LOCK_NAMESPACE = 194732;

/** Holds the account's security lock from a connection of this suite until released. */
async function holdSecurityLock(userId) {
  const client = await adminPool.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock($1::int, hashtext($2))", [SECURITY_LOCK_NAMESPACE, userId]);
  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      await client.query("ROLLBACK");
      client.release();
    },
  };
}

/** Resolves once some backend is waiting for a lock of `locktype`: the latch the interleavings turn on. */
async function someoneWaitsFor(locktype) {
  for (let polls = 0; polls < 500; polls += 1) {
    const { rows } = await adminPool.query(
      "SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = $1 AND NOT granted",
      [locktype],
    );
    if (rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No backend started waiting for a ${locktype} lock.`);
}

const nobodyWaits = async () =>
  (await adminPool.query("SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted")).rows[0].waiting === 0;

/** Whether a promise has settled by now, without waiting for it. */
async function settled(promise) {
  const pending = Symbol("pending");
  return (await Promise.race([promise.then(() => true, () => true), Promise.resolve(pending)])) !== pending;
}

// ---------------------------------------------------------------------------

describe.skipIf(!configured)("settings coordination", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await adminPool.query('TRUNCATE "user" CASCADE');
    await adminPool.query("TRUNCATE installation");
    await adminPool.query("TRUNCATE staff_log, email_log");
    await redis.flushdb();
    await loadInstallationState();

    await browser.run({ cookies: new Map(), headers: {} }, () =>
      setupRootAdmin(rootInput, { entryPoint: "server-action", headers: new Headers() }),
    );
    const [root] = await db.select().from(userTable);
    await db.update(userTable).set({ twoFactorEnabled: true, emailVerified: true }).where(eq(userTable.id, root.id));
    actors.root = await actorFor(root.id);

    actors.erin = await createUser({ name: "Erin", email: "erin@example.com" });
    actors.frank = await createUser({ name: "Frank", email: "frank@example.com" });
    actors.gina = await enroll(await createUser({ name: "Gina", email: "gina@example.com" }));
  }, 90_000);

  afterAll(async () => {
    await closeAccountSecurityLockPool();
    await adminPool?.end();
    redis.disconnect();
  });

  beforeEach(async () => {
    sent.emailChange.length = 0;
    for (const level of ["log", "warn", "error"]) spyOn(console, level).mockImplementation(() => {});
    const keys = [...(await redis.keys("settings:*")), ...(await redis.keys("stepup:totp-used:*"))];
    if (keys.length) await redis.del(...keys);
  });

  // -------------------------------------------------------------------------
  // Who waits for the security lock
  // -------------------------------------------------------------------------

  test("ordinary operations complete while the account's security lock is held; the credential protocol waits", async () => {
    const requestId = await requestAwaitingAddress(actors.erin);
    const second = await actorFor(actors.erin.id);
    const third = await actorFor(actors.erin.id);

    const held = await holdSecurityLock(actors.erin.id);
    let waiting;
    try {
      // Self-service: name, its refresh retry, sessions.
      expect(await run(actors.erin, profile.updateDisplayNameOperation, { name: "Erin B" })).toEqual({ status: "completed" });
      expect(await run(actors.erin, profile.retryProfileSessionRefreshOperation, undefined)).toEqual({ status: "completed" });
      expect(await run(actors.erin, authenticator.retryFactorSessionRefreshOperation, undefined)).toEqual({ status: "completed" });
      expect((await run(actors.erin, sessions.listSessionsOperation, { page: 1 })).total).toBe(3);
      expect(await run(actors.erin, sessions.revokeSessionOperation, { sessionId: second.session.id })).toEqual({ status: "completed" });
      expect(await run(actors.erin, sessions.revokeOtherSessionsOperation, undefined)).toEqual({ status: "completed" });
      // `third` went with the others; only the acting session is left.
      expect((await activeSessions(actors.erin.id)).map((entry) => entry.id)).toEqual([actors.erin.session.id]);
      expect(third.session.id).not.toBe(actors.erin.session.id);

      // The request transitions: one conditional statement each.
      const selected = await run(actors.erin, emailChange.selectNewEmailOperation, { requestId, newEmail: "erin.new@example.com" });
      expect(selected).toMatchObject({ delivery: "sent", request: { state: "awaiting_new" } });
      await liftCooldowns(actors.erin);
      expect((await run(actors.erin, emailChange.resendEmailRequestOperation, { requestId })).delivery).toBe("sent");
      expect(await run(actors.erin, emailChange.cancelEmailRequestOperation, { requestId })).toEqual({ status: "completed" });

      // Administration: name, its refresh retry, unban of an active account, sign-out everywhere.
      expect((await run(actors.root, admin.updateUserNameOperation, { userId: actors.erin.id, name: "Erin C" })).status).toBe("completed");
      expect((await run(actors.root, admin.retryNameSessionRefreshOperation, { userId: actors.erin.id })).status).toBe("completed");
      expect((await run(actors.root, admin.unbanUserOperation, { userId: actors.erin.id })).status).toBe("unchanged");
      expect((await run(actors.root, admin.retryUnbanSessionRefreshOperation, { userId: actors.erin.id })).status).toBe("completed");
      expect((await run(actors.root, admin.revokeUserSessionsOperation, { userId: actors.erin.id })).status).toBe("completed");
      expect(await activeSessions(actors.erin.id)).toEqual([]);
      actors.erin = await actorFor(actors.erin.id);

      // None of the above asked for a lock it had to wait for.
      expect(await nobodyWaits()).toBe(true);

      // What belongs to the protocol does wait, and writes nothing meanwhile.
      await liftCooldowns(actors.erin);
      waiting = run(actors.erin, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
      await someoneWaitsFor("advisory");
      expect(await settled(waiting)).toBe(false);
      expect((await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.userId, actors.erin.id))).filter((entry) => entry.state === "awaiting_current")).toEqual([]);
    } finally {
      await held.release();
    }
    const begun = await waiting;
    expect(begun).toMatchObject({ status: "pending", request: { state: "awaiting_current" } });
    expect((await row(actors.erin.id)).name).toBe("Erin C");
    await run(actors.erin, emailChange.cancelEmailRequestOperation, { requestId: begun.request.id });
  });

  test("the current mailbox's proof does not wait for the lock either", async () => {
    await liftCooldowns(actors.frank);
    await run(actors.frank, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    const token = tokenOf(sent.emailChange.at(-1));
    const held = await holdSecurityLock(actors.frank.id);
    try {
      expect(await runPublic(emailProof.inspectEmailProofOperation, { token })).toMatchObject({ status: "confirmable" });
      expect(await runPublic(emailProof.confirmEmailProofOperation, { token })).toEqual({ status: "current-confirmed" });
      expect(await nobodyWaits()).toBe(true);
    } finally {
      await held.release();
    }
    const [request] = await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.userId, actors.frank.id));
    expect(request).toMatchObject({ state: "awaiting_new_address", currentTokenHash: null });
    await run(actors.frank, emailChange.cancelEmailRequestOperation, { requestId: request.id });
  });

  test("an operation that really waited for the lock refuses a context another change superseded meanwhile", async () => {
    await grantStepUp(actors.gina);
    const before = await row(actors.gina.id);
    const codesBefore = (await factorRow(actors.gina.id)).backupCodes;

    const held = await holdSecurityLock(actors.gina.id);
    let waiting;
    try {
      // Admitted by the pipeline with the current generation, then queued behind the lock.
      waiting = run(actors.gina, recoveryCodes.regenerateRecoveryCodesOperation, { currentPassword: PASSWORD });
      waiting.catch(() => {});
      await someoneWaitsFor("advisory");
      // The holder's change commits while it waits.
      await db.update(userTable).set({ securityVersion: before.securityVersion + 1 }).where(eq(userTable.id, actors.gina.id));
    } finally {
      await held.release();
    }

    await expect(waiting).rejects.toMatchObject({ reason: "CONFLICT", data: { code: "SECURITY_STATE_CHANGED", retryable: true } });
    // Refused before anything of its own was written.
    expect((await row(actors.gina.id)).securityVersion).toBe(before.securityVersion + 1);
    expect((await factorRow(actors.gina.id)).backupCodes).toBe(codesBefore);
  });

  test("an administrative email change waits for the target's lock; a rename of the same account does not", async () => {
    await grantStepUp(actors.root);
    const held = await holdSecurityLock(actors.frank.id);
    let waiting;
    try {
      waiting = run(actors.root, admin.updateUserEmailOperation, { userId: actors.frank.id, email: "frank.moved@example.com" });
      await someoneWaitsFor("advisory");
      expect((await run(actors.root, admin.updateUserNameOperation, { userId: actors.frank.id, name: "Frank B" })).status).toBe("completed");
      expect(await settled(waiting)).toBe(false);
      expect((await row(actors.frank.id)).email).toBe("frank@example.com");
    } finally {
      await held.release();
    }
    expect((await waiting).status).not.toBe("unchanged");
    expect(await row(actors.frank.id)).toMatchObject({ email: "frank.moved@example.com", name: "Frank B", emailVerified: false });
    await db.update(userTable).set({ email: "frank@example.com", emailVerified: true }).where(eq(userTable.id, actors.frank.id));
    actors.frank = await actorFor(actors.frank.id);
  });

  // -------------------------------------------------------------------------
  // Conditional writes
  // -------------------------------------------------------------------------

  test("a request transition whose owner, stage, generation or deadline does not match writes nothing", async () => {
    const requestId = await requestAwaitingAddress(actors.erin);
    const untouched = await requestRow(requestId);
    const now = new Date();
    const selection = { requestId, newEmail: "erin.other@example.com", newTokenHash: sha256("a"), now };

    // Another account's context.
    expect(await persist(actors.frank, (ctx) => transitions.selectNewAddress(ctx, selection))).toBeNull();
    expect(await persist(actors.frank, (ctx) => transitions.cancelOwnedRequest(ctx, requestId, now))).toBe(false);
    // Past the deadline, as the statement sees it.
    const afterDeadline = new Date(untouched.expiresAt.getTime());
    expect(await persist(actors.erin, (ctx) => transitions.selectNewAddress(ctx, { ...selection, now: afterDeadline }))).toBeNull();
    // A stage it is not at: no mail is awaited at `awaiting_new_address`.
    const rotation = { requestId, purpose: "current", observedState: "awaiting_current", observedGeneration: 1, tokenHash: sha256("b"), now };
    expect(await persist(actors.erin, (ctx) => transitions.rotateToken(ctx, rotation))).toBeNull();
    expect(await requestRow(requestId)).toEqual(untouched);

    // The matching selection stores address, digest and stage together, once.
    const selected = await persist(actors.erin, (ctx) => transitions.selectNewAddress(ctx, selection));
    expect(selected).toMatchObject({ state: "awaiting_new", newEmail: "erin.other@example.com", newTokenHash: sha256("a"), newTokenGeneration: 1 });
    expect(selected.expiresAt).toEqual(untouched.expiresAt);
    expect(await persist(actors.erin, (ctx) => transitions.selectNewAddress(ctx, selection))).toBeNull();

    // A rotation must have observed the generation that is stored.
    const fresh = { requestId, purpose: "new", observedState: "awaiting_new", tokenHash: sha256("c"), now };
    expect(await persist(actors.erin, (ctx) => transitions.rotateToken(ctx, { ...fresh, observedGeneration: 0 }))).toBeNull();
    expect(await persist(actors.frank, (ctx) => transitions.rotateToken(ctx, { ...fresh, observedGeneration: 1 }))).toBeNull();
    expect(await persist(actors.erin, (ctx) => transitions.rotateToken(ctx, { ...fresh, observedGeneration: 1, now: afterDeadline }))).toBeNull();
    expect((await requestRow(requestId)).newTokenHash).toBe(sha256("a"));
    const rotated = await persist(actors.erin, (ctx) => transitions.rotateToken(ctx, { ...fresh, observedGeneration: 1 }));
    expect(rotated).toMatchObject({ newTokenHash: sha256("c"), newTokenGeneration: 2 });
    expect(rotated.expiresAt).toEqual(untouched.expiresAt);
    // The same observation cannot rotate twice.
    expect(await persist(actors.erin, (ctx) => transitions.rotateToken(ctx, { ...fresh, observedGeneration: 1 }))).toBeNull();

    expect(await persist(actors.erin, (ctx) => transitions.cancelOwnedRequest(ctx, requestId, now))).toBe(true);
    expect(await requestRow(requestId)).toMatchObject({ state: "cancelled", cancelReason: "user", currentTokenHash: null, newTokenHash: null });
    expect(await persist(actors.erin, (ctx) => transitions.cancelOwnedRequest(ctx, requestId, now))).toBe(false);
  });

  test("the current mailbox's proof counts once, for the digest, stage and deadline it was issued for", async () => {
    await liftCooldowns(actors.erin);
    const begun = await run(actors.erin, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    const token = tokenOf(sent.emailChange.at(-1));
    const requestId = begun.request.id;
    const stored = await requestRow(requestId);

    // Two submits of the same link at once: one confirms, the other finds it spent.
    const outcomes = await Promise.all([
      runPublic(emailProof.confirmEmailProofOperation, { token }),
      runPublic(emailProof.confirmEmailProofOperation, { token }),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["current-confirmed", "inactive"]);
    const confirmed = await requestRow(requestId);
    expect(confirmed).toMatchObject({ state: "awaiting_new_address", currentTokenHash: null });
    expect(confirmed.currentConfirmedAt).not.toBeNull();
    expect(confirmed.expiresAt).toEqual(stored.expiresAt);
    await run(actors.erin, emailChange.cancelEmailRequestOperation, { requestId });
  });

  // -------------------------------------------------------------------------
  // Resend
  // -------------------------------------------------------------------------

  test("simultaneous resends store and mail exactly one token; the link that was mailed is the one that works", async () => {
    const requestId = await requestAwaitingAddress(actors.erin);
    await run(actors.erin, emailChange.selectNewEmailOperation, { requestId, newEmail: "erin.next@example.com" });
    const before = await requestRow(requestId);
    const firstToken = tokenOf(sent.emailChange.at(-1));
    sent.emailChange.length = 0;
    await liftCooldowns(actors.erin);

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => run(actors.erin, emailChange.resendEmailRequestOperation, { requestId })),
    );
    const deliveries = results.map((result) =>
      result.status === "fulfilled" ? result.value.delivery : result.reason.reason,
    );
    expect(deliveries.filter((delivery) => delivery === "sent")).toHaveLength(1);
    // The others were refused by the cooldown, as an error or as the pending request.
    expect(deliveries.filter((delivery) => delivery !== "sent").every((delivery) => ["RATE_LIMITED", "rate-limited"].includes(delivery))).toBe(true);

    expect(sent.emailChange).toHaveLength(1);
    const after = await requestRow(requestId);
    expect(after.newTokenGeneration).toBe(before.newTokenGeneration + 1);
    expect(after.expiresAt).toEqual(before.expiresAt);
    expect(after.newTokenHash).toBe(sha256(tokenOf(sent.emailChange[0])));
    // Charged once.
    expect(Number(await redis.get(`settings:email-sends:${actors.erin.id}`))).toBe(3);

    // The superseded link proves nothing; the mailed one is confirmable.
    expect(await runPublic(emailProof.inspectEmailProofOperation, { token: firstToken })).toEqual({ status: "inactive" });
    expect(await runPublic(emailProof.inspectEmailProofOperation, { token: tokenOf(sent.emailChange[0]) })).toMatchObject({
      status: "confirmable",
      purpose: "new",
    });
    await run(actors.erin, emailChange.cancelEmailRequestOperation, { requestId });
  });

  test("a resend refused for its allowance leaves the link already mailed working", async () => {
    await liftCooldowns(actors.erin);
    const begun = await run(actors.erin, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    const token = tokenOf(sent.emailChange.at(-1));
    const before = await requestRow(begun.request.id);
    sent.emailChange.length = 0;

    // The hourly allowance is spent; the minute's cooldown has lifted.
    await liftCooldowns(actors.erin);
    await redis.set(`settings:email-sends:${actors.erin.id}`, "10", "EX", 3600);
    const refused = await run(actors.erin, emailChange.resendEmailRequestOperation, { requestId: begun.request.id });
    expect(refused).toMatchObject({ status: "pending", delivery: "rate-limited", request: { id: begun.request.id, state: "awaiting_current" } });
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);

    expect(sent.emailChange).toEqual([]);
    expect(await requestRow(begun.request.id)).toEqual(before);
    expect(await runPublic(emailProof.inspectEmailProofOperation, { token })).toMatchObject({ status: "confirmable" });
    await run(actors.erin, emailChange.cancelEmailRequestOperation, { requestId: begun.request.id });
  });

  // -------------------------------------------------------------------------
  // Finalization
  // -------------------------------------------------------------------------

  test("an address another account claims during the commit: one proof, no half-written account, the request closed", async () => {
    const requestId = await requestAwaitingAddress(actors.erin);
    await run(actors.erin, emailChange.selectNewEmailOperation, { requestId, newEmail: "contested@example.com" });
    const token = tokenOf(sent.emailChange.at(-1));
    const before = await row(actors.erin.id);

    // Another account takes the address in a transaction that has not committed yet:
    // the availability check cannot see it, the unique index can.
    const rival = await adminPool.connect();
    let confirming;
    try {
      await rival.query("BEGIN");
      await rival.query('UPDATE "user" SET email = $1 WHERE id = $2', ["contested@example.com", actors.frank.id]);

      confirming = runPublic(emailProof.confirmEmailProofOperation, { token });
      await someoneWaitsFor("transactionid");
      expect(await settled(confirming)).toBe(false);
      await rival.query("COMMIT");
    } finally {
      rival.release();
    }

    expect(await confirming).toEqual({ status: "destination-unavailable" });
    // The whole transaction rolled back: address, verification, generation, cutoff and barrier are as they were.
    expect(await row(actors.erin.id)).toEqual(before);
    expect(await requestRow(requestId)).toMatchObject({
      state: "cancelled",
      cancelReason: "account_changed",
      newTokenHash: null,
      completedAt: null,
    });
    expect((await activeSessions(actors.erin.id)).map((entry) => entry.id)).toContain(actors.erin.session.id);
    expect(await runPublic(emailProof.confirmEmailProofOperation, { token })).toEqual({ status: "inactive" });

    await db.update(userTable).set({ email: "frank@example.com" }).where(eq(userTable.id, actors.frank.id));
  });

  test("two submits of the final proof commit the change once", async () => {
    const requestId = await requestAwaitingAddress(actors.erin);
    await run(actors.erin, emailChange.selectNewEmailOperation, { requestId, newEmail: "erin.final@example.com" });
    const token = tokenOf(sent.emailChange.at(-1));
    const before = await row(actors.erin.id);

    const outcomes = await Promise.all([
      runPublic(emailProof.confirmEmailProofOperation, { token }),
      runPublic(emailProof.confirmEmailProofOperation, { token }),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["completed", "inactive"]);
    expect(outcomes.find((outcome) => outcome.status === "completed")).toEqual({ status: "completed", sessionRevocationPending: false });

    const after = await row(actors.erin.id);
    expect(after).toMatchObject({ email: "erin.final@example.com", emailVerified: true, sessionRevocationPending: false });
    expect(after.securityVersion).toBe(before.securityVersion + 1);
    expect(await requestRow(requestId)).toMatchObject({ state: "completed", currentTokenHash: null, newTokenHash: null });
    expect(await activeSessions(actors.erin.id)).toEqual([]);

    await db.update(userTable).set({ email: "erin@example.com" }).where(eq(userTable.id, actors.erin.id));
    actors.erin = await actorFor(actors.erin.id);
  });

  // -------------------------------------------------------------------------
  // Authenticator setup
  // -------------------------------------------------------------------------

  test("cancelling an attempt that was superseded leaves the newer attempt, and its pending factor, alone", async () => {
    const first = await run(actors.frank, authenticator.beginEnrollmentOperation, { currentPassword: PASSWORD });
    const second = await run(actors.frank, authenticator.beginEnrollmentOperation, { currentPassword: PASSWORD });
    expect(await setupRow(first.requestId)).toMatchObject({ state: "cancelled" });
    const pending = await factorRow(actors.frank.id);
    expect(pending.verified).toBe(false);

    // The stale form cancels the attempt it was opened for, which is already closed.
    expect(await run(actors.frank, authenticator.cancelSetupOperation, { requestId: first.requestId })).toEqual({ status: "unchanged" });
    // Another account naming the attempt cancels nothing.
    expect(await run(actors.erin, authenticator.cancelSetupOperation, { requestId: second.requestId })).toEqual({ status: "unchanged" });
    expect(await setupRow(second.requestId)).toMatchObject({ state: "pending" });
    expect(await factorRow(actors.frank.id)).toEqual(pending);

    // The newer attempt still completes.
    const secret = await symmetricDecrypt({ key: (await auth.$context).secretConfig, data: pending.secret });
    const issued = await run(actors.frank, authenticator.confirmEnrollmentOperation, { requestId: second.requestId, code: await codeFor(secret) });
    expect(issued.status).toBe("completed");
    actors.frank = await actorFor(actors.frank.id);

    // Cancelling never deletes a verified factor.
    await grantStepUp(actors.frank);
    const replacement = await run(actors.frank, authenticator.beginReplacementOperation, { currentPassword: PASSWORD });
    const verified = await factorRow(actors.frank.id);
    expect(await run(actors.frank, authenticator.cancelSetupOperation, { requestId: replacement.requestId })).toEqual({ status: "completed" });
    expect(await factorRow(actors.frank.id)).toEqual(verified);
    expect(await setupRow(replacement.requestId)).toMatchObject({ state: "cancelled", replacementSecret: null });
  });

  test("the swap re-checks the attempt and the factor in its own transaction: a closed attempt commits nothing", async () => {
    actors.gina = await actorFor(actors.gina.id);
    await grantStepUp(actors.gina);
    const started = await run(actors.gina, authenticator.beginReplacementOperation, { currentPassword: PASSWORD });
    const setup = await setupRow(started.requestId);
    const factor = await factorRow(actors.gina.id);
    const account = await row(actors.gina.id);
    const swap = {
      requestId: setup.id,
      factorId: factor.id,
      factorFingerprint: setup.currentFactorFingerprint,
      secret: setup.replacementSecret,
      encryptedCodes: "replacement-codes",
      now: new Date(),
    };
    const unchanged = async () => {
      expect(await factorRow(actors.gina.id)).toEqual(factor);
      expect((await row(actors.gina.id)).securityVersion).toBe(account.securityVersion);
    };

    // Another account, or a factor that is no longer the one the attempt was bound to.
    expect(await persist(actors.frank, (ctx) => swapFactor(ctx, swap))).toBe(false);
    expect(await persist(actors.gina, (ctx) => swapFactor(ctx, { ...swap, factorFingerprint: sha256("another secret") }))).toBe(false);
    await unchanged();
    expect(await setupRow(setup.id)).toMatchObject({ state: "pending" });

    // Cancelled between the operation's checks and the swap.
    expect(await run(actors.gina, authenticator.cancelSetupOperation, { requestId: setup.id })).toEqual({ status: "completed" });
    expect(await persist(actors.gina, (ctx) => swapFactor(ctx, swap))).toBe(false);
    await unchanged();
    expect(await setupRow(setup.id)).toMatchObject({ state: "cancelled", completedAt: null });

    // A pending attempt swaps secret, codes, request and generation together.
    await grantStepUp(actors.gina);
    const again = await run(actors.gina, authenticator.beginReplacementOperation, { currentPassword: PASSWORD });
    const staged = await setupRow(again.requestId);
    expect(await persist(actors.gina, (ctx) => swapFactor(ctx, { ...swap, requestId: staged.id, secret: staged.replacementSecret }))).toBe(true);
    expect(await factorRow(actors.gina.id)).toMatchObject({ id: factor.id, secret: staged.replacementSecret, backupCodes: "replacement-codes", verified: true });
    expect((await row(actors.gina.id)).securityVersion).toBe(account.securityVersion + 1);
    expect(await setupRow(staged.id)).toMatchObject({ state: "completed", replacementSecret: null });
    // Spent: the same swap again finds no pending attempt.
    expect(await persist(actors.gina, (ctx) => swapFactor(ctx, { ...swap, requestId: staged.id, secret: staged.replacementSecret }))).toBe(false);
  });

  test("a ban retires the pending email request and the staged enrollment with its unverified factor, in one generation", async () => {
    await liftCooldowns(actors.erin);
    const begun = await run(actors.erin, emailChange.beginEmailChangeOperation, { currentPassword: PASSWORD });
    const started = await run(actors.erin, authenticator.beginEnrollmentOperation, { currentPassword: PASSWORD });
    const before = await row(actors.erin.id);

    await grantStepUp(actors.root);
    const banned = await run(actors.root, admin.banUserOperation, { userId: actors.erin.id, duration: "24h", reason: "coordination test" });
    expect(banned.status).toBe("completed");

    expect(await requestRow(begun.request.id)).toMatchObject({ state: "cancelled", cancelReason: "banned", currentTokenHash: null });
    expect(await setupRow(started.requestId)).toMatchObject({ state: "cancelled" });
    // The enrollment's unverified provider row went with it.
    expect(await factorRow(actors.erin.id)).toBeUndefined();
    expect((await row(actors.erin.id)).securityVersion).toBe(before.securityVersion + 1);

    await run(actors.root, admin.unbanUserOperation, { userId: actors.erin.id });
    actors.erin = await actorFor(actors.erin.id);
  });
});
