import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { createOTP } from "@better-auth/utils/otp";
import { symmetricDecrypt } from "better-auth/crypto";
import * as schema from "../../src/lib/db/schema";

// Integration tests use isolated Postgres tables, never application accounts.
const namespace = `auth_setup_${randomUUID().replaceAll("-", "")}`;
const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c search_path=${namespace}`,
});
const database = drizzle(pool, { schema });
const browser = new AsyncLocalStorage();
const stored = new Map();
const redis = {
  get: async (key) => stored.get(key) ?? null,
  set: async (key, value, ...options) => {
    if (options.includes("NX") && stored.has(key)) return null;
    stored.set(key, value);
    return "OK";
  },
  del: async (key) => Number(stored.delete(key)),
  getdel: async (key) => {
    const value = stored.get(key);
    stored.delete(key);
    return value;
  },
};
mock.module("server-only", () => ({}));
mock.module("../../src/lib/db/index.ts", () => ({ db: database, ...schema }));
mock.module("../../src/lib/redis/index.ts", () => ({
  redis,
  incrementWithTtl: async (key) => {
    const value = Number(stored.get(key) ?? 0) + 1;
    stored.set(key, String(value));
    return value;
  },
  decrementIfExists: async (key) => {
    if (!stored.has(key)) return 0;
    const value = Number(stored.get(key)) - 1;
    stored.set(key, String(value));
    return value;
  },
  redisSecondaryStorage: {
    get: redis.get,
    set: redis.set,
    delete: redis.del,
    getAndDelete: redis.getdel,
    increment: async () => 1,
  },
}));
mock.module("../../src/lib/email/index.tsx", () => ({
  sendVerificationEmail: async () => {},
  sendPasswordResetEmail: async () => {},
  sendTwoFactorOtpEmail: async () => {},
}));
mock.module("next/headers", () => ({
  headers: async () => new Headers(browser.getStore().headers),
  cookies: async () => ({
    get: (key) => {
      const value = browser.getStore().cookies.get(key);
      return value ? { value } : undefined;
    },
    set: (key, value) => browser.getStore().cookies.set(key, value),
    delete: (key) => browser.getStore().cookies.delete(key),
  }),
}));
const { setupRootAdmin } =
  await import("../../app/(AuthModule)/_/operations/setup");
const { auth } = await import("../../src/lib/auth");
const { getInstallationState, loadInstallationState } =
  await import("../../src/lib/auth/installation");
const meta = { entryPoint: "server-action", headers: new Headers() };
const freshBrowser = () => ({ cookies: new Map(), headers: {} });
const input = {
  name: "Test Admin",
  email: "admin@example.com",
  password: "test-password-12345",
};
let adminCodes;
let enrolledSecret;
let adminCookie;

const { GET, POST } =
  await import("../../app/(AuthModule)/api/auth/[...all]/route");

const { defineAction } =
  await import("../../src/lib/auth/builders/actionBuilder");

const { proxy } = await import("../../proxy");
const { default: EnrollmentPage } =
  await import("../../app/(AuthModule)/auth/enroll/page");
const { default: SetupPage } =
  await import("../../app/(AuthModule)/auth/setup/page");

// Build-only environments lack PostgreSQL. Local and CI test environments with
// DATABASE_URL run this suite through the same `bun run test` entry point.
describe.skipIf(!process.env.DATABASE_URL)("setup integration", () => {
  beforeAll(async () => {
    await adminPool.query(`CREATE SCHEMA "${namespace}"`);
    for (const file of [
      "0000_lame_richard_fisk.sql",
      "0001_require_user_two_factor.sql",
      "0002_installation_root_account.sql",
      "0003_user_password_reset_cutoff.sql",
    ]) {
      await pool.query(
        (
          await readFile(
            new URL(`../../drizzle/${file}`, import.meta.url),
            "utf8",
          )
        ).replaceAll('"public".', `"${namespace}".`),
      );
    }
    await loadInstallationState();
  });
  afterAll(async () => {
    await pool.end();
    await adminPool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await adminPool.end();
  });

  const protectedAction = defineAction({
    name: "test.protected",
    handler: async () => "allowed",
  });
  const origin = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const responseCookie = (response) =>
    response.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ");

  async function request(path, body, cookie) {
    const method = body === undefined ? "GET" : "POST";
    const req = new Request(`${origin}/api/auth/${path}`, {
      method,
      headers: {
        origin,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return (method === "GET" ? GET : POST)(req, {
      params: Promise.resolve({ all: path.split("/") }),
    });
  }

  test("invalid forms and MCP cannot create an account", async () => {
    await expect(
      browser.run(freshBrowser(), () =>
        setupRootAdmin(input, { ...meta, entryPoint: "mcp" }),
      ),
    ).rejects.toMatchObject({ reason: "FORBIDDEN" });
    await expect(
      browser.run(freshBrowser(), () =>
        setupRootAdmin({ ...input, password: "short" }, meta),
      ),
    ).rejects.toMatchObject({ reason: "INVALID_INPUT" });
    expect((await pool.query('select * from "user"')).rowCount).toBe(0);
  });

  test("before setup every page and API except setup is blocked", async () => {
    expect(await browser.run(freshBrowser(), () => SetupPage())).toBeTruthy();
    for (const path of [
      "/",
      "/panel",
      "/auth/sign-in",
      "/auth/enroll",
      "/auth/email-confirmation",
    ]) {
      const response = await proxy(new NextRequest(`${origin}${path}`));
      expect(response.headers.get("location")).toBe(`${origin}/auth/setup`);
    }
    for (const path of [
      "/api/auth/sign-in/email",
      "/api/auth/get-session",
      "/api/auth/sign-out",
    ]) {
      expect((await proxy(new NextRequest(`${origin}${path}`))).status).toBe(
        503,
      );
    }
  });

  test("any existing user blocks setup even without an installation record", async () => {
    await pool.query(
      `insert into "user" (id, name, email, role) values ('existing-user', 'Existing', 'existing@example.com', 'user')`,
    );
    await loadInstallationState();
    expect(await getInstallationState()).toEqual({
      rootUserId: null,
      canSetup: false,
    });
    await expect(
      browser.run(freshBrowser(), () => SetupPage()),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    await expect(
      browser.run(freshBrowser(), () => setupRootAdmin(input, meta)),
    ).rejects.toMatchObject({ reason: "FORBIDDEN" });
    await pool.query(`delete from "user" where id = 'existing-user'`);
    await loadInstallationState();
  });

  test("provider failure rolls back user creation and installation", async () => {
    await pool.query(
      `CREATE FUNCTION reject_credential() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_credential BEFORE INSERT ON account FOR EACH ROW EXECUTE FUNCTION reject_credential();`,
    );
    await expect(
      browser.run(freshBrowser(), () => setupRootAdmin(input, meta)),
    ).rejects.toMatchObject({ reason: "INTERNAL" });
    expect((await pool.query('select * from "user"')).rowCount).toBe(0);
    expect((await pool.query("select * from installation")).rowCount).toBe(0);
    await pool.query(
      "DROP TRIGGER reject_credential ON account; DROP FUNCTION reject_credential()",
    );
  });

  test("concurrent submissions create exactly one provider-owned admin without a factor", async () => {
    const results = await Promise.allSettled([
      browser.run(freshBrowser(), () => setupRootAdmin(input, meta)),
      browser.run(freshBrowser(), () =>
        setupRootAdmin({ ...input, email: "other@example.com" }, meta),
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const users = (await pool.query('select * from "user"')).rows;
    expect(users).toHaveLength(1);
    input.email = users[0].email;
    expect(users[0].role).toBe("admin");
    expect(users[0].two_factor_required).toBe(true);
    expect(users[0].two_factor_enabled).toBe(false);
    expect((await pool.query("select * from account")).rowCount).toBe(1);
    expect((await pool.query("select * from two_factor")).rowCount).toBe(0);
    expect((await getInstallationState()).rootUserId).toBe(users[0].id);
  });

  test("completed setup is closed while the admin must finish provider TOTP enrollment", async () => {
    const login = await request("sign-in/email", {
      email: input.email,
      password: input.password,
    });
    expect(login.status).toBe(200);
    adminCookie = responseCookie(login);
    const headers = new Headers({ cookie: adminCookie });
    const panelResponse = await proxy(
      new NextRequest(`${origin}/panel`, { headers }),
    );
    expect(panelResponse.headers.get("location")).toBe(`${origin}/auth/enroll`);
    const enrollmentResponse = await proxy(
      new NextRequest(`${origin}/auth/enroll`, { headers }),
    );
    expect(enrollmentResponse.headers.get("x-middleware-next")).toBe("1");
    // The redirect trusts the signed cookie cache; an expired cache falls back
    // to the store once and re-issues it.
    expect(adminCookie).toContain("session_data");
    const tokenOnly = adminCookie
      .split("; ")
      .filter((entry) => !entry.includes("session_data"))
      .join("; ");
    const refreshed = await proxy(
      new NextRequest(`${origin}/panel`, {
        headers: new Headers({ cookie: tokenOnly }),
      }),
    );
    expect(refreshed.headers.get("location")).toBe(`${origin}/auth/enroll`);
    expect(responseCookie(refreshed)).toContain("session_data");
    const pageBrowser = { ...freshBrowser(), headers: { cookie: adminCookie } };
    expect(await browser.run(pageBrowser, () => EnrollmentPage())).toBeTruthy();
    await expect(
      browser.run(pageBrowser, () => SetupPage()),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

    await expect(
      protectedAction(undefined, { ...meta, headers }),
    ).rejects.toMatchObject({ reason: "TWO_FACTOR_ENROLLMENT_REQUIRED" });
    expect(
      (await request("update-user", { name: "Blocked" }, adminCookie)).status,
    ).toBe(403);
    expect(
      (
        await request(
          "two-factor/enable",
          { password: input.password, method: "otp" },
          adminCookie,
        )
      ).status,
    ).toBe(400);
    const enabled = await request(
      "two-factor/enable",
      { password: input.password, method: "totp" },
      adminCookie,
    );
    expect(enabled.status).toBe(200);
    const enrollment = await enabled.json();
    expect(enrollment.totpURI).toStartWith("otpauth://totp/");
    adminCodes = enrollment.backupCodes;
    expect(adminCodes).toHaveLength(10);
    const factor = (await pool.query("select * from two_factor")).rows[0];
    enrolledSecret = await symmetricDecrypt({
      key: (await auth.$context).secretConfig,
      data: factor.secret,
    });
    await expect(
      protectedAction(undefined, { ...meta, headers }),
    ).rejects.toMatchObject({ reason: "TWO_FACTOR_ENROLLMENT_REQUIRED" });
    expect(
      (
        await request(
          "two-factor/verify-totp",
          { code: "invalid" },
          adminCookie,
        )
      ).status,
    ).not.toBe(200);
    const verified = await request(
      "two-factor/verify-totp",
      { code: await createOTP(enrolledSecret).totp() },
      adminCookie,
    );
    expect(verified.status).toBe(200);
    adminCookie = responseCookie(verified);
    // Verification re-issues the cookie cache, so the proxy stops redirecting.
    expect(adminCookie).toContain("session_data");
    expect(
      (
        await proxy(
          new NextRequest(`${origin}/panel`, {
            headers: new Headers({ cookie: adminCookie }),
          }),
        )
      ).headers.get("x-middleware-next"),
    ).toBe("1");
    expect(
      await protectedAction(undefined, {
        ...meta,
        headers: new Headers({ cookie: adminCookie }),
      }),
    ).toBe("allowed");
    expect(
      (
        await request(
          "two-factor/enable",
          { password: input.password, method: "totp" },
          adminCookie,
        )
      ).status,
    ).toBe(404);
    await request("sign-out", {}, adminCookie);
  });

  test("subsequent login requires a factor and recovery codes are single-use", async () => {
    const login = await request("sign-in/email", {
      email: input.email,
      password: input.password,
    });
    expect((await login.json()).twoFactorRedirect).toBe(true);
    const challengeCookie = responseCookie(login);
    const recovery = await request(
      "two-factor/verify-backup-code",
      { code: adminCodes[0] },
      challengeCookie,
    );
    expect(recovery.status).toBe(200);
    await request("sign-out", {}, responseCookie(recovery));
    const again = await request("sign-in/email", {
      email: input.email,
      password: input.password,
    });
    expect(
      (
        await request(
          "two-factor/verify-backup-code",
          { code: adminCodes[0] },
          responseCookie(again),
        )
      ).status,
    ).not.toBe(200);
  });

  test("completed installation never permits another setup", async () => {
    await expect(
      browser.run(freshBrowser(), () => setupRootAdmin(input, meta)),
    ).rejects.toMatchObject({ reason: "FORBIDDEN" });
    expect((await pool.query("select * from installation")).rowCount).toBe(1);
  });
});
