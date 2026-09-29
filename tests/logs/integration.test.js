import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { Pool } from "pg";

/**
 * The logs module against an isolated PostgreSQL database: the migration
 * (`drizzle/0006_logs_email_and_staff.sql`) with its constraints and
 * triggers, the email recorder and the staff log (called with genuine
 * contexts from test-only guarded operations), redaction as stored,
 * idempotency and retry chains under concurrency, and the admin reads
 * through their real operations.
 *
 * Opt-in like the other integration suites: TEST_DATABASE_URL must name a
 * test-only database that differs from DATABASE_URL (PostgreSQL 18+, for
 * uuidv7(); pg_trgm available). The suite refuses to touch the configured
 * database and reports itself skipped rather than silently passing. It does
 * not need Redis: the provider session is replaced by a fixture authority,
 * while contexts are still created by `defineAction` itself.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const misconfigured = Boolean(TEST_DATABASE_URL && TEST_DATABASE_URL === process.env.DATABASE_URL);
const configured = Boolean(TEST_DATABASE_URL && !misconfigured);
if (misconfigured) throw new Error("TEST_DATABASE_URL must not point at the configured DATABASE_URL.");
if (!configured) console.warn("logs integration: skipped (set TEST_DATABASE_URL to run).");
else process.env.DATABASE_URL = TEST_DATABASE_URL;

const sessions = new Map();
mock.module("server-only", () => ({}));
mock.module("../../src/lib/auth/sessionAuthority.ts", () => ({
  resolveAuthoritativeSession: async (headers) => sessions.get(headers.get("cookie") ?? "") ?? null,
  SessionAuthorityUnavailableError: class extends Error {},
}));
mock.module("../../src/lib/auth/index.ts", () => ({ auth: { api: {} } }));
mock.module("../../src/lib/redis/index.ts", () => ({
  redis: {},
  incrementWithTtl: async () => 1,
  decrementIfExists: async () => 0,
}));
mock.module("../../src/lib/email/index.tsx", () => ({ sendTwoFactorOtpEmail: async () => {} }));

const { z } = await import("zod");
const { db } = await import("../../src/lib/db/index.ts");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { defineAction } = await import("../../src/lib/auth/builders/actionBuilder.ts");
const { recordStaffLog, StaffLogError } = await import("../../app/(LogsModule)/_/db/staffLogService.ts");
const { date, text, url, user, value } = await import("../../app/(LogsModule)/_/staffLog/blocks.ts");
const { beginEmailLog, completeEmailLog } = await import("../../app/(LogsModule)/_/db/emailLogService.ts");
const { REDACTED, REDACTED_LINK } = await import("../../app/(LogsModule)/_/redaction.ts");
const logQueries = await import("../../app/(LogsModule)/admin/_/operations/logQueries.ts");
const { EMAIL_LOGS_QUERY_DEFAULTS, STAFF_LOGS_QUERY_DEFAULTS } = await import("../../app/(LogsModule)/admin/_/queryState.ts");

const pool = configured ? new Pool({ connectionString: TEST_DATABASE_URL }) : null;

// ---------------------------------------------------------------------------
// Genuine contexts: test-only guarded operations run a recorder in their handler
// ---------------------------------------------------------------------------

const callable = z.custom((value) => typeof value === "function");
const capture = async (run) => {
  try {
    return { value: await run() };
  } catch (error) {
    return { error };
  }
};
const recordAsSignedIn = defineAction({
  name: "test.logs.record",
  schema: callable,
  handler: (ctx, run) => capture(() => run(ctx)),
});
const recordPublicly = defineAction({
  name: "test.logs.record-public",
  auth: "public",
  schema: callable,
  handler: (ctx, run) => capture(() => run(ctx)),
});

function actor(id, name, extra = {}) {
  const user = {
    id,
    name,
    email: `${id}@example.test`,
    emailVerified: true,
    role: "user",
    twoFactorRequired: false,
    twoFactorEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  };
  const cookie = `session=${id}`;
  sessions.set(cookie, { user, session: { id: `session-${id}`, userId: id, token: `t-${id}`, impersonatedBy: null } });
  return { id, cookie, user };
}
const actors = {
  root: actor("root-user-id", "Root", { role: "admin", twoFactorRequired: true, twoFactorEnabled: true }),
  ada: actor("user-ada", "Ada Lovelace"),
  moderator: actor("user-mod", "Mod", { role: "moderator", twoFactorRequired: true, twoFactorEnabled: true }),
  secondAdmin: actor("admin-2", "Second Admin", { role: "admin", twoFactorRequired: true, twoFactorEnabled: true }),
};
/** Signed in, but without an account row: the staff log's actor reference refuses them. */
const ghost = actor("ghost-user-id", "Ghost");
/** The staff log references the acting account, so the fixture actors exist as rows, under their fixture names. */
async function seedAccounts() {
  for (const { user: account } of Object.values(actors)) {
    await pool.query(
      `INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [account.id, account.name, account.email],
    );
  }
}
const removeAccounts = () =>
  pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [Object.values(actors).map((who) => who.id)]);
const metaFor = (who) => ({ entryPoint: "server-action", headers: new Headers(who ? { cookie: who.cookie } : {}) });

/** Runs `run(ctx)` as `who` (or anonymously) and returns `{ value }` or `{ error }`. */
async function as(who, run) {
  return who ? recordAsSignedIn(run, metaFor(who)) : recordPublicly(run, metaFor(null));
}
const staff = (who, entry) => as(who, (ctx) => recordStaffLog(ctx, entry));
const begin = (who, input) => as(who, (ctx) => beginEmailLog(ctx, input));
const complete = (who, input) => as(who, (ctx) => completeEmailLog(ctx, input));
const ok = async (promise) => {
  const result = await promise;
  if (result.error) throw result.error;
  return result.value;
};
const failure = async (promise) => {
  const result = await promise;
  expect(result.error).toBeDefined();
  return result.error;
};

const read = (operation, input) => operation(input, metaFor(actors.root));
const rows = async (table, where = "true", params = []) =>
  (await pool.query(`SELECT * FROM ${table} WHERE ${where} ORDER BY id`, params)).rows;
const rowText = async (table, id) =>
  (await pool.query(`SELECT row_to_json(t)::text AS text FROM ${table} t WHERE id = $1`, [id])).rows[0].text;

let sequence = 0;
const key = (label = "k") => `test:${label}:${++sequence}`;
const anna = { id: "user-42", name: "Anna" };
const ban = (overrides = {}) => ({
  action: "user.banned",
  resource: { type: "user", id: anna.id },
  message: [text("Banned "), user(anna), text(" until "), date("2026-09-25T14:32:00.000Z"), text(". Reason: "), value("Spam")],
  ...overrides,
});
const staffRows = async (where = "true", params = []) =>
  (await pool.query(`SELECT * FROM staff_log WHERE ${where} ORDER BY created_at, id`, params)).rows;
/** The one entry `who` wrote by `run`, as stored. */
async function written(who, entry) {
  const before = (await staffRows()).map((row) => row.id);
  expect(await ok(staff(who, entry))).toBeUndefined();
  const added = (await staffRows()).filter((row) => !before.includes(row.id));
  expect(added).toHaveLength(1);
  return added[0];
}
const verificationEmail = (overrides = {}) => ({
  recordKey: key("email"),
  recipientEmail: "Alice@Example.TEST",
  recipientUserId: "user-42",
  recipientLabel: "Alice",
  subject: "482913 is your verification code",
  contentText: "Your verification code is 482913.\nConfirm: https://app.example.test/verify?token=tok_abc123",
  provider: "resend",
  secrets: { verificationCode: "482913", confirmUrl: "https://app.example.test/verify?token=tok_abc123" },
  ...overrides,
});

describe.skipIf(!configured)("logs integration", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
  }, 60_000);

  afterAll(async () => {
    // Entries first: an account with entries cannot be deleted.
    await pool?.query("TRUNCATE email_log, staff_log");
    if (pool) await removeAccounts();
    await pool?.end();
    await db.$client.end();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE email_log, staff_log");
    await seedAccounts();
    for (const level of ["log", "warn", "error"]) spyOn(console, level).mockImplementation(() => {});
  });

  // -------------------------------------------------------------------------
  describe("schema", () => {
    test("foreign keys: the retry chain references email_log only, the staff log only its actor; all RESTRICT", async () => {
      const { rows: keys } = await pool.query(`
        SELECT c.conname AS name, source.relname AS source, target.relname AS target, c.confdeltype AS on_delete
        FROM pg_constraint c
        JOIN pg_class source ON source.oid = c.conrelid
        JOIN pg_class target ON target.oid = c.confrelid
        WHERE c.contype = 'f' AND source.relname IN ('email_log', 'staff_log', 'audit_log')
        ORDER BY c.conname`);
      expect(keys).toEqual([
        { name: "email_log_original_log_id_email_log_id_fk", source: "email_log", target: "email_log", on_delete: "r" },
        { name: "email_log_previous_attempt_id_email_log_id_fk", source: "email_log", target: "email_log", on_delete: "r" },
        { name: "staff_log_actor_id_user_id_fk", source: "staff_log", target: "user", on_delete: "r" },
      ]);
    });

    test("the staff log has the documented columns and the audit log is gone", async () => {
      const { rows: columns } = await pool.query(
        `SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'staff_log' ORDER BY ordinal_position`,
      );
      expect(columns).toEqual(
        ["id", "created_at", "actor_id", "action", "resource_type", "resource_id", "message", "message_text"].map((name) => ({
          name,
          nullable: "NO",
        })),
      );
      const { rows: [tables] } = await pool.query(`SELECT to_regclass('audit_log') AS audit, to_regclass('staff_log') AS staff`);
      expect(tables).toEqual({ audit: null, staff: "staff_log" });
    });

    test("local-column checks refuse inconsistent rows", async () => {
      const digest = "a".repeat(64);
      const email = (columns) =>
        pool.query(
          `INSERT INTO email_log (record_key, input_digest, started_at, recipient_email, subject, content_text,
             attempt_number, requester_kind, requester_id, requester_label, request_id, search_text, status,
             completed_at, completion_digest, original_log_id, previous_attempt_id)
           VALUES ($1, $2, now(), $3, 's', 'c', $4, $5, $6, $7, 'r', 's', $8, $9, $10, $11, $12)`,
          [
            key("raw"),
            digest,
            columns.recipient ?? "a@example.test",
            columns.attempt ?? 1,
            columns.kind ?? "user",
            columns.requesterId === undefined ? "u" : columns.requesterId,
            columns.label ?? "U",
            columns.status ?? "sending",
            columns.completedAt ?? null,
            columns.completionDigest ?? null,
            columns.original ?? null,
            columns.previous ?? null,
          ],
        );
      await expect(email({})).resolves.toBeTruthy();
      for (const invalid of [
        { kind: "user", requesterId: null },
        { kind: "anonymous", requesterId: "u", label: "Anonymous" },
        { kind: "anonymous", requesterId: null, label: "Someone" },
        { kind: "system", requesterId: null },
        { status: "delivered" },
        { status: "accepted" },
        { status: "sending", completedAt: new Date(), completionDigest: digest },
        { status: "accepted", completedAt: new Date(Date.now() - 86_400_000), completionDigest: digest },
        { attempt: 2 },
        { recipient: "Upper@Example.test" },
      ]) {
        await expect(email(invalid)).rejects.toMatchObject({ code: "23514" });
      }

      const entry = (columns) =>
        pool.query(
          `INSERT INTO staff_log (actor_id, action, resource_type, resource_id, message, message_text)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
          [
            columns.actor ?? actors.root.id,
            columns.action ?? "user.banned",
            columns.resourceType ?? "user",
            columns.resourceId ?? "user-42",
            columns.message ?? '[{"type":"text","value":"x"}]',
            columns.messageText ?? "x",
          ],
        );
      await expect(entry({})).resolves.toBeTruthy();
      for (const invalid of [
        { action: "User.Banned" },
        { action: "user banned" },
        { action: "" },
        { resourceType: "" },
        { resourceId: "" },
        { message: "[]" },
        { message: '{"type":"text"}' },
        { message: '"Banned Anna"' },
        { messageText: "" },
      ]) {
        await expect(entry(invalid)).rejects.toMatchObject({ code: "23514" });
      }
      // The actor is a real reference: an ID without an account is refused.
      await expect(entry({ actor: "nobody" })).rejects.toMatchObject({
        code: "23503",
        constraint: "staff_log_actor_id_user_id_fk",
      });
      expect(await staffRows()).toHaveLength(1);
    });

    test("a staff log entry can be neither updated nor deleted; truncating the table still works", async () => {
      const row = await written(actors.root, ban());
      for (const statement of [
        "UPDATE staff_log SET message_text = 'edited' WHERE id = $1",
        "UPDATE staff_log SET actor_id = actor_id WHERE id = $1",
        "DELETE FROM staff_log WHERE id = $1",
      ]) {
        await expect(pool.query(statement, [row.id])).rejects.toMatchObject({
          message: "staff_log is append-only",
          code: "23000",
        });
      }
      expect(await staffRows("id = $1", [row.id])).toEqual([row]);
      await pool.query("TRUNCATE staff_log");
      expect(await staffRows()).toEqual([]);
    });

    test("an account that has entries cannot be deleted; one without entries can", async () => {
      await written(actors.secondAdmin, ban());
      await expect(pool.query(`DELETE FROM "user" WHERE id = $1`, [actors.secondAdmin.id])).rejects.toMatchObject({
        code: "23001",
        constraint: "staff_log_actor_id_user_id_fk",
      });
      expect((await pool.query(`SELECT id FROM "user" WHERE id = $1`, [actors.secondAdmin.id])).rows).toHaveLength(1);
      expect(await staffRows()).toHaveLength(1);
      // The account an entry is about is not referenced: only who acted is.
      const deleted = await pool.query(`DELETE FROM "user" WHERE id = $1`, [actors.moderator.id]);
      expect(deleted.rowCount).toBe(1);
    });

    test("an attempt's initiation snapshot and final states cannot change", async () => {
      const { id } = await ok(begin(actors.ada, verificationEmail()));
      await expect(pool.query("UPDATE email_log SET subject = 'changed' WHERE id = $1", [id])).rejects.toMatchObject({
        message: "email_log initiation columns are immutable",
      });
      await ok(complete(actors.ada, { id, status: "accepted", secrets: {} }));
      await expect(
        pool.query("UPDATE email_log SET status = 'failed', completion_digest = $2 WHERE id = $1", [id, "b".repeat(64)]),
      ).rejects.toMatchObject({ message: "email_log status accepted cannot change to failed" });
    });
  });

  // -------------------------------------------------------------------------
  describe("staff log recorder", () => {
    test("one entry is one row: the actor from the context, the blocks as given, the sentence derived", async () => {
      const startedAt = Date.now();
      const row = await written(actors.root, ban());
      expect(row).toMatchObject({
        actor_id: "root-user-id",
        action: "user.banned",
        resource_type: "user",
        resource_id: "user-42",
        message_text: "Banned Anna until 25 Sep 2026, 14:32 UTC. Reason: Spam",
      });
      expect(row.message).toEqual([
        { type: "text", value: "Banned " },
        { type: "user", id: "user-42", label: "Anna" },
        { type: "text", value: " until " },
        { type: "date", value: "2026-09-25T14:32:00.000Z" },
        { type: "text", value: ". Reason: " },
        { type: "value", value: "Spam" },
      ]);
      expect(Object.keys(row).sort()).toEqual(
        ["action", "actor_id", "created_at", "id", "message", "message_text", "resource_id", "resource_type"].sort(),
      );
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
      expect(Math.abs(row.created_at.getTime() - startedAt)).toBeLessThan(60_000);
    });

    test("the actor is whoever the context says: another staff member writes under their own ID", async () => {
      const first = await written(actors.root, ban());
      const second = await written(actors.secondAdmin, ban({ action: "user.unbanned", message: [text("Unbanned "), user(anna)] }));
      expect([first.actor_id, second.actor_id]).toEqual(["root-user-id", "admin-2"]);
      expect(second.message_text).toBe("Unbanned Anna");
      // The name is never stored with the actor: only who.
      expect(JSON.stringify(second)).not.toContain("Second Admin");
    });

    test("the resource is any module's: a type and an opaque ID, without a lookup", async () => {
      const row = await written(actors.root, {
        action: "invoice.voided",
        resource: { type: "invoice", id: "INV/2026/09-0042" },
        message: [text("Voided "), url("/admin/invoices/42", "invoice 42"), text(" of "), user({ id: "user-7", name: "" })],
      });
      expect(row).toMatchObject({
        action: "invoice.voided",
        resource_type: "invoice",
        resource_id: "INV/2026/09-0042",
        message_text: "Voided invoice 42 of Unnamed user",
      });
      expect(row.message[3]).toEqual({ type: "user", id: "user-7", label: "Unnamed user" });
    });

    test("the same action twice is two entries: there is no idempotency key", async () => {
      await written(actors.root, ban());
      await written(actors.root, ban());
      expect(await staffRows()).toHaveLength(2);
    });

    test("an invalid entry throws StaffLogError naming paths and codes only, and stores nothing", async () => {
      const secret = "do-not-echo-482913";
      const cases = [
        ban({ action: "User.Banned" }),
        ban({ action: `bad action ${secret}` }),
        ban({ resource: { type: "user", id: "" } }),
        ban({ resource: { type: "User", id: "user-42" } }),
        ban({ resource: { type: "user", id: "x".repeat(129) } }),
        ban({ message: [] }),
        ban({ message: Array.from({ length: 51 }, () => text("x")) }),
        ban({ message: [text("x".repeat(4_001))] }),
        ban({ message: [{ type: "changes", items: [secret] }] }),
        ban({ message: [{ type: "text", value: secret, html: true }] }),
        ban({ message: [{ type: "text", value: `two\nlines ${secret}` }] }),
        ban({ message: [{ type: "url", href: `javascript:alert('${secret}')`, label: "Link" }] }),
        ban({ message: [{ type: "date", value: "25 Sep 2026" }] }),
        ban({ message: [{ type: "user", id: "user-42" }] }),
        // The actor cannot be supplied.
        ban({ actorId: actors.ada.id }),
        ban({ actor: { id: actors.ada.id } }),
      ];
      for (const entry of cases) {
        const error = await failure(staff(actors.root, entry));
        expect(error).toBeInstanceOf(StaffLogError);
        expect(error.name).toBe("StaffLogError");
        expect(error.message).toMatch(/^Invalid staff log entry /);
        expect(error.cause).toBeUndefined();
      }
      // Every case but the one whose action itself is the secret: the refused value is never repeated.
      for (const entry of cases.filter((entry) => !entry.action.includes(secret))) {
        expect((await failure(staff(actors.root, entry))).message).not.toContain(secret);
      }
      expect(await staffRows()).toEqual([]);
    });

    test("an entry that cannot be stored throws StaffLogError with the cause, and stores nothing", async () => {
      // Signed in without an account row: the actor reference refuses the insert.
      const missing = await failure(staff(ghost, ban()));
      expect(missing).toBeInstanceOf(StaffLogError);
      expect(missing.message).toBe('Staff log entry "user.banned" could not be stored.');
      expect(missing.cause).toBeDefined();

      await pool.query("ALTER TABLE staff_log ADD CONSTRAINT test_reject CHECK (action <> 'user.banned') NOT VALID");
      try {
        const refused = await failure(staff(actors.root, ban()));
        expect(refused).toBeInstanceOf(StaffLogError);
        expect(refused.message).toBe('Staff log entry "user.banned" could not be stored.');
        expect(refused.message).not.toContain("Spam");
        // Another action is unaffected.
        await written(actors.root, ban({ action: "user.unbanned", message: [text("Unbanned "), user(anna)] }));
      } finally {
        await pool.query("ALTER TABLE staff_log DROP CONSTRAINT test_reject");
      }
      expect((await staffRows()).map((row) => row.action)).toEqual(["user.unbanned"]);
    });
  });

  // -------------------------------------------------------------------------
  describe("email recorder", () => {
    test("begin stores the redacted initiation snapshot as sending; the requester comes from the context", async () => {
      const result = await ok(begin(actors.ada, verificationEmail()));
      const [row] = await rows("email_log", "id = $1", [result.id]);
      expect(row).toMatchObject({
        status: "sending",
        attempt_number: 1,
        original_log_id: null,
        previous_attempt_id: null,
        recipient_email: "alice@example.test",
        recipient_user_id: "user-42",
        recipient_label: "Alice",
        subject: `${REDACTED} is your verification code`,
        content_text: `Your verification code is ${REDACTED}.\nConfirm: ${REDACTED}`,
        provider: "resend",
        requester_kind: "user",
        requester_id: "user-ada",
        requester_label: "Ada Lovelace",
        completed_at: null,
        completion_digest: null,
        redaction_version: 1,
      });
      expect(row.search_text).toBe(`${REDACTED} is your verification code\nalice@example.test\nAlice`);
      const text = await rowText("email_log", result.id);
      expect(text).not.toContain("482913");
      expect(text).not.toContain("tok_abc123");

      const anonymous = await ok(begin(null, verificationEmail({ recipientUserId: undefined, recipientLabel: undefined })));
      const [public_] = await rows("email_log", "id = $1", [anonymous.id]);
      expect(public_).toMatchObject({ requester_kind: "anonymous", requester_id: null, requester_label: "Anonymous", recipient_user_id: null });
    });

    test("content is bounded in UTF-8 bytes, not characters; subjects are bounded after redaction", async () => {
      const limit = 128 * 1024;
      const exact = "é".repeat(limit / 2);
      const { id } = await ok(begin(actors.ada, verificationEmail({ contentText: exact, secrets: {} })));
      const { rows: [row] } = await pool.query("SELECT octet_length(content_text) AS bytes FROM email_log WHERE id = $1", [id]);
      expect(row.bytes).toBe(limit);
      expect((await failure(begin(actors.ada, verificationEmail({ contentText: exact + "a", secrets: {} })))).code).toBe("INVALID_RECORD");
      // A 1-character secret replaced by a 10-character marker can push a subject past 500.
      const subject = "q ".repeat(249) + "q";
      expect((await failure(begin(actors.ada, verificationEmail({ subject, secrets: { s: "q" } })))).issues).toEqual([
        { path: "subject", code: "too_big" },
      ]);
      expect(await rows("email_log", "id <> $1", [id])).toEqual([]);
    });

    test("begin is idempotent on its key and refuses a different payload or requester", async () => {
      const input = verificationEmail();
      const first = await ok(begin(actors.ada, input));
      expect(await ok(begin(actors.ada, input))).toEqual({ id: first.id, duplicate: true });
      expect((await failure(begin(actors.ada, { ...input, subject: "Another subject" }))).code).toBe("RECORD_KEY_CONFLICT");
      expect((await failure(begin(actors.root, input))).code).toBe("RECORD_KEY_CONFLICT");
      expect((await failure(begin(actors.ada, { ...input, recipientEmail: "a@x.test" }))).code).toBe("RECORD_KEY_CONFLICT");
      const results = await Promise.all(Array.from({ length: 10 }, () => ok(begin(actors.ada, { ...input, recordKey: "concurrent-begin" }))));
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    });

    test("completion: each terminal state, duplicates, conflicts and one resolution of unknown", async () => {
      const start = async () => (await ok(begin(actors.ada, verificationEmail()))).id;

      const accepted = await start();
      expect(await ok(complete(actors.ada, { id: accepted, status: "accepted", providerMessageId: "msg_1", secrets: {} }))).toEqual({ id: accepted, duplicate: false });
      // The identical observation again, even from another context, is a duplicate.
      expect(await ok(complete(actors.root, { id: accepted, status: "accepted", providerMessageId: "msg_1", secrets: {} }))).toEqual({ id: accepted, duplicate: true });
      expect((await failure(complete(actors.ada, { id: accepted, status: "failed", secrets: {} }))).code).toBe("COMPLETION_CONFLICT");
      expect((await failure(complete(actors.ada, { id: accepted, status: "unknown", secrets: {} }))).code).toBe("COMPLETION_CONFLICT");
      const [acceptedRow] = await rows("email_log", "id = $1", [accepted]);
      expect(acceptedRow).toMatchObject({ status: "accepted", provider_message_id: "msg_1" });
      expect(acceptedRow.completed_at >= acceptedRow.started_at).toBe(true);

      const failed = await start();
      await ok(
        complete(actors.ada, {
          id: failed,
          status: "failed",
          errorCode: "PROVIDER_REJECTED",
          errorMessage: "Rejected message 482913 is your verification code for https://app.example.test/verify?token=tok_abc123",
          stackTrace: "Error: 482913\n    at send",
          secrets: { verificationCode: "482913" },
        }),
      );
      const [failedRow] = await rows("email_log", "id = $1", [failed]);
      expect(failedRow).toMatchObject({
        status: "failed",
        error_code: "PROVIDER_REJECTED",
        error_message: `Rejected message ${REDACTED} is your verification code for ${REDACTED_LINK}`,
        stack_trace: `Error: ${REDACTED}\n    at send`,
      });

      const unknown = await start();
      await ok(complete(actors.ada, { id: unknown, status: "unknown", errorCode: "TIMEOUT", errorMessage: "Request timed out", secrets: {} }));
      expect((await failure(complete(actors.ada, { id: unknown, status: "unknown", errorCode: "OTHER", secrets: {} }))).code).toBe("COMPLETION_CONFLICT");
      const [before] = await rows("email_log", "id = $1", [unknown]);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(await ok(complete(actors.ada, { id: unknown, status: "accepted", providerMessageId: "msg_2", secrets: {} }))).toEqual({ id: unknown, duplicate: false });
      const [resolved] = await rows("email_log", "id = $1", [unknown]);
      expect(resolved).toMatchObject({ status: "accepted", provider_message_id: "msg_2", error_code: null, error_message: null });
      expect(resolved.completed_at > before.completed_at).toBe(true);
      expect(resolved.updated_at > before.updated_at).toBe(true);
      expect(resolved.completion_digest).not.toBe(before.completion_digest);
      // Resolved once: accepted is final.
      expect((await failure(complete(actors.ada, { id: unknown, status: "failed", secrets: {} }))).code).toBe("COMPLETION_CONFLICT");

      const unknownToFailed = await start();
      await ok(complete(actors.ada, { id: unknownToFailed, status: "unknown", secrets: {} }));
      await ok(complete(actors.ada, { id: unknownToFailed, status: "failed", errorCode: "BOUNCED", secrets: {} }));
      expect((await rows("email_log", "id = $1", [unknownToFailed]))[0]).toMatchObject({ status: "failed", error_code: "BOUNCED" });

      // The initiation snapshot survived every completion.
      const [snapshot] = await rows("email_log", "id = $1", [accepted]);
      expect(snapshot.subject).toBe(`${REDACTED} is your verification code`);
    });

    test("completion refuses an unknown log, a time before the start, and a secret in its provider ID", async () => {
      expect((await failure(complete(actors.ada, { id: "01900000-0000-7000-8000-00000000dead", status: "accepted", secrets: {} }))).code).toBe("NOT_FOUND");
      const startedAt = new Date(Date.now() - 60_000);
      const { id } = await ok(begin(actors.ada, verificationEmail({ startedAt })));
      expect((await failure(complete(actors.ada, { id, status: "failed", completedAt: new Date(startedAt.getTime() - 1), secrets: {} }))).code).toBe("INVALID_RECORD");
      expect((await failure(complete(actors.ada, { id, status: "accepted", providerMessageId: "id-482913", secrets: { code: "482913" } }))).code).toBe("INVALID_RECORD");
      const completedAt = new Date(startedAt.getTime() + 1_000);
      await ok(complete(actors.ada, { id, status: "failed", completedAt, secrets: {} }));
      expect((await rows("email_log", "id = $1", [id]))[0].completed_at).toEqual(completedAt);
      expect(await ok(complete(actors.ada, { id, status: "failed", completedAt, secrets: {} }))).toEqual({ id, duplicate: true });
    });

    test("retries form a chain with numbered attempts, the original and the retried attempt", async () => {
      const first = await ok(begin(actors.ada, verificationEmail()));
      await ok(complete(actors.ada, { id: first.id, status: "failed", secrets: {} }));
      const second = await ok(begin(actors.root, verificationEmail({ previousAttemptId: first.id, subject: "New code 111222", secrets: { code: "111222" } })));
      const third = await ok(begin(null, verificationEmail({ previousAttemptId: second.id, recipientEmail: "ALICE@example.test" })));

      const chain = await rows("email_log", "id = $1 OR original_log_id = $1", [first.id]);
      const byId = Object.fromEntries(chain.map((row) => [row.id, row]));
      expect(byId[first.id]).toMatchObject({ attempt_number: 1, original_log_id: null, previous_attempt_id: null });
      expect(byId[second.id]).toMatchObject({ attempt_number: 2, original_log_id: first.id, previous_attempt_id: first.id, requester_id: "root-user-id", subject: `New code ${REDACTED}` });
      expect(byId[third.id]).toMatchObject({ attempt_number: 3, original_log_id: first.id, previous_attempt_id: second.id, requester_kind: "anonymous" });

      // The predecessor must be the latest attempt; the recipient must stay; the predecessor must exist.
      expect((await failure(begin(actors.ada, verificationEmail({ previousAttemptId: first.id })))).code).toBe("STALE_PREDECESSOR");
      expect((await failure(begin(actors.ada, verificationEmail({ previousAttemptId: third.id, recipientEmail: "bob@example.test" })))).code).toBe("RECIPIENT_MISMATCH");
      expect((await failure(begin(actors.ada, verificationEmail({ previousAttemptId: third.id, recipientUserId: "user-43" })))).code).toBe("RECIPIENT_MISMATCH");
      expect((await failure(begin(actors.ada, verificationEmail({ previousAttemptId: "01900000-0000-7000-8000-00000000dead" })))).code).toBe("NOT_FOUND");
      // A retry of the very request that created attempt 3 is answered before the chain check.
      const retryInput = verificationEmail({ recordKey: "retry-key", previousAttemptId: third.id });
      const fourth = await ok(begin(actors.ada, retryInput));
      expect(await ok(begin(actors.ada, retryInput))).toEqual({ id: fourth.id, duplicate: true });
      // History is RESTRICTed, not cascaded.
      await expect(pool.query("DELETE FROM email_log WHERE id = $1", [first.id])).rejects.toMatchObject({ code: "23001" });
    });

    test("competing retries of one predecessor serialize: exactly one succeeds, the rest are stale", async () => {
      const first = await ok(begin(actors.ada, verificationEmail()));
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, index) => begin(actors.ada, verificationEmail({ recordKey: `race-${index}`, previousAttemptId: first.id }))),
      );
      expect(results.filter((result) => result.value)).toHaveLength(1);
      expect(results.filter((result) => result.error).map((result) => result.error.code)).toEqual(Array(7).fill("STALE_PREDECESSOR"));
      const identical = await Promise.all(
        Array.from({ length: 6 }, () => begin(actors.ada, verificationEmail({ recordKey: "same-retry", previousAttemptId: results.find((r) => r.value).value.id }))),
      );
      expect(new Set(identical.map((result) => result.value.id)).size).toBe(1);
      const numbers = (await rows("email_log")).map((row) => row.attempt_number).sort();
      expect(numbers).toEqual([1, 2, 3]);
    });
  });

  // -------------------------------------------------------------------------
  describe("admin reads", () => {
    async function seedEmails() {
      const old = await ok(begin(actors.ada, verificationEmail({ startedAt: new Date(Date.now() - 40 * 86_400_000), subject: "Old 100% discount_code" })));
      const welcome = await ok(begin(actors.ada, verificationEmail({ subject: "Welcome aboard", recipientEmail: "bob@example.test", recipientUserId: "user-bob", recipientLabel: "Bob", contentText: "secret body words", secrets: {} })));
      await ok(complete(actors.ada, { id: welcome.id, status: "failed", stackTrace: "stackonly words", secrets: {} }));
      const plain = await ok(begin(actors.ada, verificationEmail({ subject: "Plain 100% off", recipientUserId: undefined })));
      return { old, welcome, plain };
    }

    test("email list: default 30 days, filters, literal search over metadata only, sorting and clamping", async () => {
      const { old, welcome, plain } = await seedEmails();
      const list = (change) => read(logQueries.listEmailLogsOperation, { ...EMAIL_LOGS_QUERY_DEFAULTS, ...change });
      const ids = (page) => page.items.map((item) => item.id);

      const defaults = await list({});
      expect(ids(defaults).sort()).toEqual([welcome.id, plain.id].sort());
      expect(Object.keys(defaults.items[0]).sort()).toEqual(
        ["attemptNumber", "id", "originalLogId", "recipientEmail", "recipientLabel", "recipientUserId", "requester", "startedAt", "status", "subject"].sort(),
      );
      expect(JSON.stringify(defaults)).not.toContain("secret body");
      expect(ids(await list({ range: "all" }))).toContain(old.id);
      expect(ids(await list({ status: "failed" }))).toEqual([welcome.id]);
      expect(ids(await list({ recipient: "bob@example.test" }))).toEqual([welcome.id]);
      expect(ids(await list({ userId: "user-42", range: "all" }))).toEqual([old.id]);
      expect(ids(await list({ q: "WELCOME" }))).toEqual([welcome.id]);
      expect(ids(await list({ q: "100%", range: "all" })).sort()).toEqual([old.id, plain.id].sort());
      expect(ids(await list({ q: "discount_code", range: "all" }))).toEqual([old.id]);
      expect(ids(await list({ q: "%" , range: "all"}))).toHaveLength(2);
      expect(ids(await list({ q: "_" , range: "all"}))).toEqual([old.id]);
      expect(ids(await list({ q: "body words" }))).toEqual([]);
      expect(ids(await list({ q: "stackonly" }))).toEqual([]);
      expect(ids(await list({ q: "bob" }))).toEqual([welcome.id]);

      const bySubject = await list({ range: "all", sort: "subject", direction: "asc" });
      expect(bySubject.items.map((item) => item.subject)).toEqual(["Old 100% discount_code", "Plain 100% off", "Welcome aboard"]);
      const clamped = await list({ range: "all", page: 99, pageSize: 10 });
      expect(clamped.page).toBe(1);
      expect(clamped.query.page).toBe(1);
      expect(clamped.total).toBe(3);
    });

    test("custom ranges include the whole end day in UTC and exclude the next day's start", async () => {
      const at = (iso) => ok(begin(actors.ada, verificationEmail({ startedAt: new Date(iso) })));
      const inside = await at("2026-09-01T00:00:00.000Z");
      const lastMoment = await at("2026-09-02T23:59:59.999Z");
      await at("2026-09-03T00:00:00.000Z");
      await at("2026-08-31T23:59:59.999Z");
      const page = await read(logQueries.listEmailLogsOperation, { ...EMAIL_LOGS_QUERY_DEFAULTS, range: "custom", from: "2026-09-01", to: "2026-09-02" });
      expect(page.items.map((item) => item.id).sort()).toEqual([inside.id, lastMoment.id].sort());
      expect(page.range).toEqual({ from: "2026-09-01T00:00:00.000Z", until: "2026-09-03T00:00:00.000Z" });
    });

    test("stable order: equal sort keys fall back to the ID in the same direction", async () => {
      const startedAt = new Date(Date.now() - 1_000);
      for (let index = 0; index < 5; index += 1) await ok(begin(actors.ada, verificationEmail({ startedAt })));
      const desc = await read(logQueries.listEmailLogsOperation, EMAIL_LOGS_QUERY_DEFAULTS);
      const asc = await read(logQueries.listEmailLogsOperation, { ...EMAIL_LOGS_QUERY_DEFAULTS, direction: "asc" });
      const descIds = desc.items.map((item) => item.id);
      expect(descIds).toEqual([...descIds].sort().reverse());
      expect(asc.items.map((item) => item.id)).toEqual([...descIds].reverse());
      const pages = [];
      for (const page of [1, 2, 3]) pages.push(...(await read(logQueries.listEmailLogsOperation, { ...EMAIL_LOGS_QUERY_DEFAULTS, pageSize: 10, page })).items.map((item) => item.id));
      expect(new Set(pages).size).toBe(5);
    });

    test("email detail: explicit projection, and the attempt chain paginated in the same snapshot", async () => {
      let previous = await ok(begin(actors.ada, verificationEmail({ recordKey: "chain-0" })));
      const first = previous;
      for (let index = 1; index < 23; index += 1) {
        previous = await ok(begin(actors.ada, verificationEmail({ recordKey: `chain-${index}`, previousAttemptId: previous.id })));
      }
      const detail = await read(logQueries.getEmailLogOperation, { id: previous.id });
      expect(Object.keys(detail).sort()).toEqual(
        ["attemptNumber", "attempts", "completedAt", "contentText", "createdAt", "errorCode", "errorMessage", "id", "originalLogId", "previousAttemptId", "provider", "providerMessageId", "recipientEmail", "recipientLabel", "recipientUserId", "redactionVersion", "requestId", "requester", "stackTrace", "startedAt", "status", "subject", "updatedAt"].sort(),
      );
      expect(detail).toMatchObject({ attemptNumber: 23, originalLogId: first.id, completedAt: null, errorCode: null });
      expect(detail.attempts).toMatchObject({ page: 1, pageSize: 20, total: 23 });
      expect(detail.attempts.items.map((item) => item.attemptNumber)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
      expect(Object.keys(detail.attempts.items[0]).sort()).toEqual(["attemptNumber", "id", "requester", "startedAt", "status"]);
      const second = await read(logQueries.getEmailLogOperation, { id: first.id, attemptsPage: 2 });
      expect(second.attempts.items.map((item) => item.attemptNumber)).toEqual([21, 22, 23]);
      const clamped = await read(logQueries.getEmailLogOperation, { id: first.id, attemptsPage: 50 });
      expect(clamped.attempts.page).toBe(2);
      const single = await ok(begin(actors.ada, verificationEmail()));
      expect((await read(logQueries.getEmailLogOperation, { id: single.id })).attempts).toMatchObject({ total: 1, page: 1 });
      await expect(read(logQueries.getEmailLogOperation, { id: "01900000-0000-7000-8000-00000000dead" })).rejects.toMatchObject({ reason: "NOT_FOUND" });
    });

    const staffList = (change = {}, who = actors.root) =>
      logQueries.listStaffLogsOperation({ ...STAFF_LOGS_QUERY_DEFAULTS, ...change }, metaFor(who));
    const staffIds = async (change) => (await staffList(change)).items.map((item) => item.id);
    const bob = { id: "user-bob", name: "Bob" };

    /** Four entries, oldest first: two accounts, two staff members, three actions. */
    async function seedStaffLog() {
      const banned = await written(actors.root, ban());
      const renamed = await written(actors.secondAdmin, {
        action: "user.name.updated",
        resource: { type: "user", id: bob.id },
        message: [text("Changed name from "), value("Robert 100% discount_code"), text(" to "), user(bob)],
      });
      const unbanned = await written(actors.secondAdmin, {
        action: "user.unbanned",
        resource: { type: "user", id: anna.id },
        message: [text("Unbanned "), user(anna)],
      });
      const voided = await written(actors.root, {
        action: "invoice.voided",
        // Another module's resource that happens to share an account's ID.
        resource: { type: "invoice", id: bob.id },
        message: [text("Voided "), url("/admin/invoices/42", "invoice 42"), text(". 100% refunded")],
      });
      return { banned, renamed, unbanned, voided };
    }

    test("staff list: newest first, an explicit projection, the message as blocks", async () => {
      const { banned, renamed, unbanned, voided } = await seedStaffLog();
      const page = await staffList();
      expect(page.items.map((item) => item.id)).toEqual([voided.id, unbanned.id, renamed.id, banned.id]);
      expect(page).toMatchObject({ total: 4, page: 1, pageSize: 25, query: STAFF_LOGS_QUERY_DEFAULTS });
      expect(Object.keys(page).sort()).toEqual(["asOf", "items", "page", "pageSize", "query", "range", "total"]);
      expect(page.range.until).not.toBeNull();
      const oldest = page.items.at(-1);
      expect(Object.keys(oldest).sort()).toEqual(["action", "actor", "createdAt", "id", "message", "resource"]);
      expect(oldest).toEqual({
        id: banned.id,
        createdAt: banned.created_at.toISOString(),
        actor: { id: "root-user-id", name: "Root" },
        action: "user.banned",
        resource: { type: "user", id: "user-42" },
        message: ban().message,
      });
      // The search column is the server's: never returned.
      expect(JSON.stringify(page)).not.toContain("messageText");
      expect(JSON.stringify(page)).not.toContain("message_text");
    });

    test("staff list: entries of the same instant fall back to the ID, newest first, across pages", async () => {
      const at = new Date(Date.now() - 1_000);
      for (let index = 0; index < 12; index += 1) {
        await pool.query(
          `INSERT INTO staff_log (created_at, actor_id, action, resource_type, resource_id, message, message_text)
           VALUES ($1, $2, 'user.banned', 'user', 'user-42', $3::jsonb, $4)`,
          [at, actors.root.id, JSON.stringify([text(`Entry ${index}`)]), `Entry ${index}`],
        );
      }
      const first = await staffList({ pageSize: 10 });
      const second = await staffList({ pageSize: 10, page: 2 });
      expect(first.total).toBe(12);
      expect(first.items).toHaveLength(10);
      expect(second.items).toHaveLength(2);
      const ids = [...first.items, ...second.items].map((item) => item.id);
      expect(new Set(ids).size).toBe(12);
      expect(ids).toEqual([...ids].sort().reverse());
      const clamped = await staffList({ pageSize: 10, page: 99 });
      expect(clamped.page).toBe(2);
      expect(clamped.query.page).toBe(2);
      expect(clamped.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id));
      const empty = await staffList({ resourceId: "nobody", page: 5 });
      expect(empty).toMatchObject({ items: [], total: 0, page: 1 });
    });

    test("staff list: the resource ID alone finds a resource's history; the type narrows it", async () => {
      const { banned, renamed, unbanned, voided } = await seedStaffLog();
      expect(await staffIds({ resourceId: anna.id })).toEqual([unbanned.id, banned.id]);
      // Without a type, the ID matches whatever kind of resource carries it.
      expect(await staffIds({ resourceId: bob.id })).toEqual([voided.id, renamed.id]);
      expect(await staffIds({ resourceId: bob.id, resourceType: "user" })).toEqual([renamed.id]);
      expect(await staffIds({ resourceId: bob.id, resourceType: "invoice" })).toEqual([voided.id]);
      expect(await staffIds({ resourceType: "user" })).toEqual([unbanned.id, renamed.id, banned.id]);
      expect(await staffIds({ resourceId: "user-4" })).toEqual([]);
      expect(await staffIds({ resourceId: "USER-42" })).toEqual([]);
    });

    test("staff list: by staff member, by one or several actions, and their intersections", async () => {
      const { banned, renamed, unbanned, voided } = await seedStaffLog();
      expect(await staffIds({ actorId: "root-user-id" })).toEqual([voided.id, banned.id]);
      expect(await staffIds({ actorId: "admin-2" })).toEqual([unbanned.id, renamed.id]);
      expect(await staffIds({ actorId: "user-ada" })).toEqual([]);
      expect(await staffIds({ actions: ["user.banned"] })).toEqual([banned.id]);
      expect(await staffIds({ actions: ["user.banned", "user.unbanned"] })).toEqual([unbanned.id, banned.id]);
      expect(await staffIds({ actions: ["user.banned", "user.unbanned", "user.never.happened"] })).toEqual([unbanned.id, banned.id]);
      expect(await staffIds({ actions: ["user.never.happened"] })).toEqual([]);
      // A prefix is not a family: actions match exactly.
      expect(await staffIds({ actions: ["user"] })).toEqual([]);
      expect(await staffIds({ actions: [] })).toHaveLength(4);
      expect(await staffIds({ actorId: "admin-2", actions: ["user.banned", "user.unbanned"] })).toEqual([unbanned.id]);
      expect(await staffIds({ actorId: "admin-2", resourceId: anna.id })).toEqual([unbanned.id]);
      expect(await staffIds({ actorId: "root-user-id", actions: ["user.unbanned"] })).toEqual([]);
    });

    test("staff list: search matches the sentence that is rendered, literally and whatever the case", async () => {
      const { banned, renamed, unbanned, voided } = await seedStaffLog();
      expect(await staffIds({ q: "banned anna" })).toEqual([unbanned.id, banned.id]);
      expect(await staffIds({ q: "BANNED ANNA UNTIL" })).toEqual([banned.id]);
      // The date as shown, a value, a link's label.
      expect(await staffIds({ q: "25 Sep 2026, 14:32 UTC" })).toEqual([banned.id]);
      expect(await staffIds({ q: "Reason: Spam" })).toEqual([banned.id]);
      expect(await staffIds({ q: "invoice 42" })).toEqual([voided.id]);
      // Pattern characters are literal.
      expect(await staffIds({ q: "100%" })).toEqual([voided.id, renamed.id]);
      expect(await staffIds({ q: "discount_code" })).toEqual([renamed.id]);
      expect(await staffIds({ q: "_" })).toEqual([renamed.id]);
      expect(await staffIds({ q: "%" })).toEqual([voided.id, renamed.id]);
      // Only the sentence: not the action key, IDs, the stored ISO date, an address or the staff member's name.
      for (const q of ["user.banned", "user-42", "2026-09-25T14", "/admin/invoices", "Second Admin", "root-user-id"]) {
        expect(await staffIds({ q })).toEqual([]);
      }
      expect(await staffIds({ q: "anna", actorId: "admin-2" })).toEqual([unbanned.id]);
    });

    test("staff list: the default 30 days, all time, and custom ranges including the whole end day", async () => {
      const at = async (iso) =>
        (
          await pool.query(
            `INSERT INTO staff_log (created_at, actor_id, action, resource_type, resource_id, message, message_text)
             VALUES ($1, $2, 'user.banned', 'user', 'user-42', '[{"type":"text","value":"Old entry"}]'::jsonb, 'Old entry')
             RETURNING id`,
            [new Date(iso), actors.root.id],
          )
        ).rows[0].id;
      const recent = await written(actors.root, ban());
      const old = await at(new Date(Date.now() - 40 * 86_400_000).toISOString());
      const inside = await at("2025-09-01T00:00:00.000Z");
      const lastMoment = await at("2025-09-02T23:59:59.999Z");
      const after = await at("2025-09-03T00:00:00.000Z");
      const before = await at("2025-08-31T23:59:59.999Z");

      expect(await staffIds({})).toEqual([recent.id]);
      expect(await staffIds({ range: "90d" })).toEqual([recent.id, old]);
      expect(await staffIds({ range: "all" })).toEqual([recent.id, old, after, lastMoment, inside, before]);
      const custom = await staffList({ range: "custom", from: "2025-09-01", to: "2025-09-02" });
      expect(custom.items.map((item) => item.id)).toEqual([lastMoment, inside]);
      expect(custom.range).toEqual({ from: "2025-09-01T00:00:00.000Z", until: "2025-09-03T00:00:00.000Z" });
      expect((await staffList({ range: "all" })).range).toEqual({ from: null, until: null });
    });

    test("staff list: the staff member is named as they are now; a user block keeps the name it was given", async () => {
      // The second admin bans the moderator, then both accounts are renamed.
      const moderator = { id: actors.moderator.id, name: "Mod" };
      const row = await written(actors.secondAdmin, {
        action: "user.banned",
        resource: { type: "user", id: moderator.id },
        message: [text("Banned "), user(moderator), text(" permanently")],
      });
      expect((await staffList({ resourceId: moderator.id })).items[0]).toMatchObject({
        actor: { id: "admin-2", name: "Second Admin" },
        message: [{ type: "text", value: "Banned " }, { type: "user", id: moderator.id, label: "Mod" }, { type: "text", value: " permanently" }],
      });

      await pool.query(`UPDATE "user" SET name = 'Renamed Admin' WHERE id = $1`, [actors.secondAdmin.id]);
      await pool.query(`UPDATE "user" SET name = 'Renamed Moderator' WHERE id = $1`, [moderator.id]);

      const [item] = (await staffList({ resourceId: moderator.id })).items;
      expect(item.id).toBe(row.id);
      expect(item.actor).toEqual({ id: "admin-2", name: "Renamed Admin" });
      expect(item.message[1]).toEqual({ type: "user", id: moderator.id, label: "Mod" });
      // The entry itself did not change, and search still matches what it says.
      expect(await staffRows("id = $1", [row.id])).toEqual([row]);
      expect(await staffIds({ q: "Banned Mod permanently" })).toEqual([row.id]);
      expect(await staffIds({ q: "Renamed" })).toEqual([]);
      // The name in the signed-in session is not what is shown either: the account row is.
      expect(sessions.get(actors.secondAdmin.cookie).user.name).toBe("Second Admin");
    });

    test("staff list: stored blocks are read tolerantly, in place, without echoing what was not understood", async () => {
      const {
        rows: [{ id }],
      } = await pool.query(
        `INSERT INTO staff_log (actor_id, action, resource_type, resource_id, message, message_text)
         VALUES ($1, 'project.archived', 'project', 'p-1', $2::jsonb, 'Archived Apollo')
         RETURNING id`,
        [
          actors.root.id,
          JSON.stringify([
            { type: "text", value: "Archived " },
            { type: "chart", points: [1, 2, 3], html: "<b>x</b>" },
            { type: "user", id: "u-9" },
            { type: "url", href: "javascript:alert(1)", label: "Apollo" },
            { type: "value", value: "Apollo" },
          ]),
        ],
      );
      const [item] = (await staffList({ resourceId: "p-1" })).items;
      expect(item).toMatchObject({ id, action: "project.archived", resource: { type: "project", id: "p-1" } });
      expect(item.message).toEqual([
        { type: "text", value: "Archived " },
        { type: "unsupported" },
        { type: "unsupported" },
        { type: "unsupported" },
        { type: "value", value: "Apollo" },
      ]);
      expect(JSON.stringify(item)).not.toContain("<b>x</b>");
      expect(JSON.stringify(item)).not.toContain("javascript:");
    });

    test("staff filter options: the staff members and actions the log contains, named as they are now", async () => {
      const options = () => logQueries.listStaffLogFilterOptionsOperation(undefined, metaFor(actors.root));
      expect(await options()).toEqual({ actors: [], actions: [] });
      await seedStaffLog();
      expect(await options()).toEqual({
        actors: [
          { id: "root-user-id", name: "Root" },
          { id: "admin-2", name: "Second Admin" },
        ],
        actions: ["invoice.voided", "user.banned", "user.name.updated", "user.unbanned"],
      });
      await pool.query(`UPDATE "user" SET name = 'Aaron Admin' WHERE id = $1`, [actors.secondAdmin.id]);
      expect((await options()).actors).toEqual([
        { id: "admin-2", name: "Aaron Admin" },
        { id: "root-user-id", name: "Root" },
      ]);
    });

    test("reads are admin-only even against real rows", async () => {
      await written(actors.root, ban());
      const { id } = await ok(begin(actors.ada, verificationEmail()));
      for (const who of [actors.moderator, actors.ada]) {
        await expect(staffList({}, who)).rejects.toMatchObject({ reason: "NOT_FOUND" });
        await expect(staffList({ resourceId: who.id }, who)).rejects.toMatchObject({ reason: "NOT_FOUND" });
        await expect(logQueries.listStaffLogFilterOptionsOperation(undefined, metaFor(who))).rejects.toMatchObject({ reason: "NOT_FOUND" });
        await expect(logQueries.getEmailLogOperation({ id }, metaFor(who))).rejects.toMatchObject({ reason: "NOT_FOUND" });
        await expect(logQueries.listEmailLogsOperation(EMAIL_LOGS_QUERY_DEFAULTS, metaFor(who))).rejects.toMatchObject({ reason: "NOT_FOUND" });
      }
      await expect(logQueries.listEmailLogsOperation(EMAIL_LOGS_QUERY_DEFAULTS, metaFor(null))).rejects.toMatchObject({ reason: "UNAUTHENTICATED" });
      await expect(staffList({}, null)).rejects.toMatchObject({ reason: "UNAUTHENTICATED" });
      await expect(staffList({}, actors.root)).resolves.toMatchObject({ total: 1 });
      await expect(staffList({}, actors.secondAdmin)).resolves.toMatchObject({ total: 1 });
    });
  });
});
