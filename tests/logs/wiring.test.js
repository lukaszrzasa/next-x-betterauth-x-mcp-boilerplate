import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { Pool } from "pg";

/**
 * The logs wired into the application, end to end: the real operations, the
 * real Better Auth configuration and its email hooks, the real email module
 * and the real recorders, against isolated PostgreSQL and Redis databases.
 * Only the email provider's HTTP client is replaced, so a test decides what
 * Resend answers. This is the path an administrator takes when they rename
 * a user (one staff log entry) or send a verification email that the
 * provider refuses (one email log attempt, and no staff log entry: sending
 * changes nothing). Each user service's own entry is covered by
 * `tests/admin-users/`.
 *
 * Opt-in like the other integration suites (TEST_DATABASE_URL and
 * TEST_REDIS_URL, both different from the configured services); skipped,
 * and reported as skipped, without them.
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
  console.warn("logs wiring: skipped (set TEST_DATABASE_URL and TEST_REDIS_URL to run).");
} else {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
}
const apiKey = process.env.RESEND_API_KEY || "re_test_key";
process.env.RESEND_API_KEY = apiKey;

/** What the provider answers next; each call is recorded. */
const provider = {
  calls: [],
  answer: async () => ({ data: { id: "msg_default" }, error: null, headers: {} }),
};
mock.module("resend", () => ({
  Resend: class {
    emails = {
      send: async (message) => {
        provider.calls.push(message);
        return provider.answer(message);
      },
    };
  },
}));

const browser = new AsyncLocalStorage();
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
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

const { db, user: userTable } = await import("../../src/lib/db/index.ts");
const { redis } = await import("../../src/lib/redis/index.ts");
const { auth } = await import("../../src/lib/auth/index.ts");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { sql } = await import("drizzle-orm");
const { loadInstallationState } = await import("../../src/lib/auth/installation.ts");
const { closeAccountSecurityLockPool } = await import("../../app/(AuthModule)/_/db/security/accountLock.ts");
const { setupRootAdmin } = await import("../../app/(AuthModule)/_/operations/setup.ts");
const { loadAdminUserOperations } = await import("../helpers/authOperations.js");
const { mutations, emails } = await loadAdminUserOperations();
const { defineAction } = await import("../../src/lib/auth/builders/actionBuilder.ts");
const { sendTwoFactorOtpEmail, EmailDeliveryError } = await import("../../src/lib/email/index.tsx");
const { loadLogReadOperations } = await import("../helpers/logOperations.js");
const logQueries = await loadLogReadOperations();
const { EMAIL_LOGS_QUERY_DEFAULTS, STAFF_LOGS_QUERY_DEFAULTS } = await import("../../app/(LogsModule)/admin/_/queryState.ts");

const pool = configured ? new Pool({ connectionString: TEST_DATABASE_URL }) : null;
const rootInput = { name: "Root Admin", email: "root@example.com", password: "root-password-12345" };
const actors = {};

async function actorFor(id) {
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(id);
  const signature = createHmac("sha256", context.secret).update(session.token).digest("base64");
  return { id, session, cookie: `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}` };
}

function run(actor, operation, input) {
  return browser.run({ cookies: new Map(), headers: { cookie: actor.cookie } }, () =>
    operation(input, { entryPoint: "server-action", headers: new Headers({ cookie: actor.cookie }) }),
  );
}

const emailRows = async (recipient) =>
  (await pool.query("select * from email_log where recipient_email = $1 order by started_at, id", [recipient])).rows;
/** The staff log entries about one resource, oldest first. */
const staffRows = async (resourceId) =>
  (await pool.query("select * from staff_log where resource_id = $1 order by created_at, id", [resourceId])).rows;

describe.skipIf(!configured)("logs wiring", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    // The staff log references its actors, so it goes with the accounts.
    await pool.query('TRUNCATE "user" CASCADE');
    await pool.query("TRUNCATE installation");
    await pool.query("TRUNCATE staff_log, email_log");
    await redis.flushdb();
    await loadInstallationState();
    for (const level of ["log", "warn", "error"]) spyOn(console, level).mockImplementation(() => {});

    await browser.run({ cookies: new Map(), headers: {} }, () =>
      setupRootAdmin(rootInput, { entryPoint: "server-action", headers: new Headers({ "user-agent": "setup-browser" }) }),
    );
    const [root] = await db.select().from(userTable);
    await db.update(userTable).set({ twoFactorEnabled: true, emailVerified: true }).where(sql`${userTable.id} = ${root.id}`);
    actors.root = await actorFor(root.id);

    const { user } = await auth.api.createUser({
      body: { name: "Alicia", email: "alicia@example.com", password: "password-12345", role: "user" },
      headers: new Headers({ cookie: actors.root.cookie }),
    });
    actors.target = { id: user.id };
  }, 60_000);

  afterAll(async () => {
    await closeAccountSecurityLockPool();
    await pool?.end();
    redis.disconnect();
  });

  beforeEach(() => {
    provider.calls.length = 0;
    provider.answer = async () => ({ data: { id: "msg_default" }, error: null, headers: {} });
  });

  test("the setup's own verification email is logged, requested anonymously, without its link", async () => {
    const [attempt] = await emailRows(rootInput.email);
    expect(attempt).toMatchObject({
      status: "accepted",
      provider: "resend",
      provider_message_id: "msg_default",
      requester_kind: "anonymous",
      requester_id: null,
      recipient_user_id: actors.root.id,
      recipient_label: "Root Admin",
      subject: "Verify your email address",
    });
    // The link is a declared secret (it carries the token), so it goes as a secret, not as a link.
    expect(attempt.content_text).toContain("Verify email address [REDACTED]");
    expect(attempt.content_text).not.toMatch(/token=|https?:\/\//);
  });

  test("setting up the installation is not a staff action: nothing is in the staff log", async () => {
    expect((await pool.query("select count(*)::int as entries from staff_log")).rows[0].entries).toBe(0);
  });

  test("renaming a user writes one staff log entry, which the admin list shows", async () => {
    const outcome = await run(actors.root, mutations.updateUserNameOperation, { userId: actors.target.id, name: "Alicia Keys" });
    expect(outcome.status).toBe("completed");
    expect(outcome.unrecorded).toBeUndefined();

    const entries = await staffRows(actors.target.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actor_id: actors.root.id,
      action: "user.name.updated",
      resource_type: "user",
      resource_id: actors.target.id,
      message_text: "Changed name from Alicia to Alicia Keys",
    });
    expect(entries[0].message).toEqual([
      { type: "text", value: "Changed name from " },
      { type: "value", value: "Alicia" },
      { type: "text", value: " to " },
      { type: "user", id: actors.target.id, label: "Alicia Keys" },
    ]);

    const page = await run(actors.root, logQueries.listStaffLogsOperation, {
      ...STAFF_LOGS_QUERY_DEFAULTS,
      resourceId: actors.target.id,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: entries[0].id,
      actor: { id: actors.root.id, name: "Root Admin" },
      action: "user.name.updated",
      resource: { type: "user", id: actors.target.id },
      message: entries[0].message,
    });
    expect(await run(actors.root, logQueries.listStaffLogFilterOptionsOperation, undefined)).toEqual({
      actors: [{ id: actors.root.id, name: "Root Admin" }],
      actions: ["user.name.updated"],
    });

    // The same name again changes nothing and is not logged.
    const again = await run(actors.root, mutations.updateUserNameOperation, { userId: actors.target.id, name: "Alicia Keys" });
    expect(again.status).toBe("unchanged");
    expect(await staffRows(actors.target.id)).toHaveLength(1);
  });

  test("a verification email the provider refuses is logged as failed; sending is not a staff log entry", async () => {
    provider.answer = async () => ({
      data: null,
      error: { name: "validation_error", statusCode: 422, message: "The `to` address is not allowed in testing." },
      headers: {},
    });
    await expect(run(actors.root, emails.sendVerificationOperation, { userId: actors.target.id })).rejects.toMatchObject({
      reason: "INTERNAL",
    });
    expect(provider.calls).toHaveLength(1);
    // Rendered once: the provider got the HTML and its plain-text part.
    expect(provider.calls[0].html).toContain("<html");
    expect(provider.calls[0].text).toContain("Verify email address");

    const [attempt] = await emailRows("alicia@example.com");
    expect(attempt).toMatchObject({
      status: "failed",
      requester_kind: "user",
      requester_id: actors.root.id,
      requester_label: "Root Admin",
      recipient_user_id: actors.target.id,
      error_code: "validation_error",
      error_message: "The `to` address is not allowed in testing.",
    });
    expect(attempt.completed_at).not.toBeNull();
    expect(attempt.content_text).not.toMatch(/https?:\/\//);

    // The attempt is what the admin list reads.
    const emailsPage = await run(actors.root, logQueries.listEmailLogsOperation, EMAIL_LOGS_QUERY_DEFAULTS);
    expect(emailsPage.items.find((item) => item.id === attempt.id)).toMatchObject({ status: "failed" });
    // Only the rename is in the staff log.
    expect((await staffRows(actors.target.id)).map((entry) => entry.action)).toEqual(["user.name.updated"]);
  });

  test("an accepted verification email completes its attempt with the provider's ID", async () => {
    await redis.del(`admin-email:target:verification:${actors.target.id}`);
    provider.answer = async () => ({ data: { id: "msg_accepted" }, error: null, headers: {} });
    expect(await run(actors.root, emails.sendVerificationOperation, { userId: actors.target.id })).toEqual({
      status: "completed",
      userId: actors.target.id,
    });
    const attempts = await emailRows("alicia@example.com");
    expect(attempts.at(-1)).toMatchObject({ status: "accepted", provider_message_id: "msg_accepted" });
    expect(attempts.map((attempt) => attempt.status)).toEqual(["failed", "accepted"]);
    expect((await staffRows(actors.target.id)).map((entry) => entry.action)).toEqual(["user.name.updated"]);
  });

  test("no answer from the provider is recorded as unknown, never as failed or accepted", async () => {
    provider.answer = async () => ({
      data: null,
      error: { name: "application_error", statusCode: null, message: "Unable to fetch data. The request could not be resolved." },
      headers: {},
    });
    const probe = defineAction({
      name: "test.sendCode",
      handler: () => sendTwoFactorOtpEmail({ to: "alicia@example.com", code: "493817", expiresInMinutes: 5 }),
    });
    const error = await run(actors.root, probe, undefined).catch((caught) => caught);
    expect(error).toMatchObject({ reason: "INTERNAL" });
    expect(error.cause).toBeInstanceOf(EmailDeliveryError);
    expect(error.cause.status).toBe("unknown");
    expect(error.cause.message).not.toContain("493817");

    const attempt = (await emailRows("alicia@example.com")).at(-1);
    expect(attempt).toMatchObject({ status: "unknown", error_code: "application_error" });
    // The code is a declared secret: gone from the subject, the body and the preview.
    expect(attempt.subject).toBe("[REDACTED] is your verification code");
    expect(JSON.stringify(attempt)).not.toContain("493817");
  });

  test("a missing API key fails before anything leaves the application", async () => {
    // A fresh module instance: the client is built lazily, once.
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import(`../../src/lib/email/send.ts?fresh=${Date.now()}`);
    try {
      await expect(
        sendEmail({ purpose: "verification", to: "nokey@example.com", subject: "Hi", react: "Hello", secrets: {} }),
      ).rejects.toMatchObject({ status: "failed" });
    } finally {
      process.env.RESEND_API_KEY = apiKey;
    }
    expect(provider.calls).toHaveLength(0);
    const [attempt] = await emailRows("nokey@example.com");
    expect(attempt).toMatchObject({ status: "failed", error_code: "configuration", requester_kind: "anonymous" });
    expect(attempt.error_message).toContain("RESEND_API_KEY is not set");
  });

  test("a completion that cannot be written changes nothing about the delivery; the attempt stays sending", async () => {
    // The attempt can begin, and no observation can be recorded.
    await pool.query("ALTER TABLE email_log ADD CONSTRAINT test_no_completion CHECK (status = 'sending') NOT VALID");
    const errors = console.error;
    try {
      const probe = defineAction({
        name: "test.sendCode",
        handler: () => sendTwoFactorOtpEmail({ to: "uncompleted@example.com", code: "774411", expiresInMinutes: 5 }),
      });

      provider.answer = async () => ({ data: { id: "msg_uncompleted" }, error: null, headers: {} });
      errors.mockClear();
      expect(await run(actors.root, probe, undefined)).toEqual({ id: "msg_uncompleted" });
      const reported = errors.mock.calls.filter(([line]) => String(line).includes("email log not completed"));
      expect(reported).toHaveLength(1);
      expect(JSON.stringify(reported)).toContain("STORAGE_FAILED");
      expect(JSON.stringify(errors.mock.calls)).not.toContain("774411");

      // A refusal is still the caller's refusal, not the log's failure.
      provider.answer = async () => ({
        data: null,
        error: { name: "validation_error", statusCode: 422, message: "Refused." },
        headers: {},
      });
      const error = await run(actors.root, probe, undefined).catch((caught) => caught);
      expect(error.cause).toBeInstanceOf(EmailDeliveryError);
      expect(error.cause.status).toBe("failed");
      expect(provider.calls).toHaveLength(2);
    } finally {
      await pool.query("ALTER TABLE email_log DROP CONSTRAINT test_no_completion");
    }

    const attempts = await emailRows("uncompleted@example.com");
    expect(attempts).toHaveLength(2);
    for (const attempt of attempts) {
      expect(attempt).toMatchObject({
        status: "sending",
        completed_at: null,
        completion_digest: null,
        provider_message_id: null,
        error_code: null,
        requester_id: actors.root.id,
      });
    }
  });

  test("a log that cannot be written never stops the email", async () => {
    await pool.query("ALTER TABLE email_log RENAME TO email_log_offline");
    try {
      provider.answer = async () => ({ data: { id: "msg_unlogged" }, error: null, headers: {} });
      const probe = defineAction({
        name: "test.sendCode",
        handler: () => sendTwoFactorOtpEmail({ to: "alicia@example.com", code: "111222", expiresInMinutes: 5 }),
      });
      expect(await run(actors.root, probe, undefined)).toEqual({ id: "msg_unlogged" });
      expect(provider.calls).toHaveLength(1);
    } finally {
      await pool.query("ALTER TABLE email_log_offline RENAME TO email_log");
    }
  });
});
