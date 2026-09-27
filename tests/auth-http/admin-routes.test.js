import { beforeAll, expect, mock, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { admin, twoFactor } from "better-auth/plugins";
import { ac, roles } from "../../src/lib/auth/permissions";

const baseURL = "http://localhost:3000";
const auth = betterAuth({
  baseURL,
  secret: "test-only-secret-with-at-least-thirty-two-characters",
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  emailAndPassword: { enabled: true },
  plugins: [
    admin({ ac, roles }),
    twoFactor({ otpOptions: { sendOTP: async () => {} } }),
  ],
});

// Run in a separate process from builder tests, which mock this same module.
mock.module("server-only", () => ({}));
mock.module("../../src/lib/auth/index.ts", () => ({ auth }));
// The boundary resolves callers through the session authority; here the
// in-memory provider session is the authority (no database row to merge).
mock.module("../../src/lib/auth/sessionAuthority.ts", () => ({
  resolveAuthoritativeSession: (headers) =>
    auth.api.getSession({ headers, query: { disableCookieCache: true } }),
}));
const { GET, POST } = await import("../../app/(AuthModule)/api/auth/[...all]/route");
const cookies = {};
let targetId;

async function request(path, method = "GET", cookie, body) {
  const req = new Request(`${baseURL}/api/auth/${path}`, {
    method,
    headers: {
      origin: baseURL,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  // Model Next's decoded catch-all parameters, including encoded separators.
  const all = new URL(req.url).pathname.slice("/api/auth/".length)
    .split("/").filter(Boolean).map(decodeURIComponent);
  return (method === "GET" ? GET : POST)(req, { params: Promise.resolve({ all }) });
}

beforeAll(async () => {
  for (const role of ["admin", "moderator", "user"]) {
    const email = `${role}@example.com`;
    const password = "test-password-12345";
    const { user } = await auth.api.createUser({ body: { email, password, name: role, role } });
    if (role === "user") targetId = user.id;
    const response = await request("sign-in/email", "POST", undefined, { email, password });
    expect(response.status).toBe(200);
    cookies[role] = response.headers.get("set-cookie").split(";")[0];
  }
  // An ordinary member with no enrollment requirement, never banned by the tests below.
  await auth.api.createUser({ body: { email: "member@example.com", password: "test-password-12345", name: "member", role: "user" } });
  const member = await request("sign-in/email", "POST", undefined, { email: "member@example.com", password: "test-password-12345" });
  cookies.member = member.headers.get("set-cookie").split(";")[0];
});

test("all installed admin endpoints and future endpoints are blocked for every caller", async () => {
  const paths = Object.values(auth.api)
    .map((endpoint) => endpoint.path)
    .filter((path) => path?.startsWith("/admin/"));
  expect(paths.length).toBeGreaterThan(10);
  for (const path of [...paths, "/admin/future-operation"]) {
    for (const cookie of [undefined, ...Object.values(cookies)]) {
      for (const method of ["GET", "POST"]) {
        const response = await request(path.slice(1), method, cookie);
        expect(response.status).toBe(404);
      }
    }
  }
});

test("path variants cannot expose admin operations", async () => {
  for (const path of ["admin", "admin/ban-user/", "%61dmin/ban-user", "admin%2Fban-user", "admin/list-users?limit=10"]) {
    expect((await request(path, "POST", cookies.admin, { userId: targetId })).status).toBe(404);
  }
});

test("HTTP ban has no effect while authenticated server-side APIs remain available", async () => {
  const headers = new Headers({ cookie: cookies.moderator });
  expect((await request("admin/ban-user", "POST", cookies.moderator, { userId: targetId })).status).toBe(404);
  const before = await auth.api.listUsers({ headers, query: {} });
  expect(before.users.find((user) => user.id === targetId).banned).toBeFalsy();
  await auth.api.banUser({ headers, body: { userId: targetId } });
  const after = await auth.api.listUsers({ headers, query: {} });
  expect(after.users.find((user) => user.id === targetId).banned).toBe(true);
});

test("ordinary session lookup still reaches Better Auth", async () => {
  const response = await request("get-session", "GET", cookies.admin);
  expect(response.status).toBe(200);
  expect((await response.json()).user.role).toBe("admin");
});


test("email codes serve the sign-in challenge only, never a signed-in session", async () => {
  for (const path of ["two-factor/send-otp", "two-factor/verify-otp"]) {
    // Mid-session, Better Auth would enable 2FA without an authenticator; hidden.
    // (The "user" session was banned by an earlier test, so it is anonymous here.)
    for (const cookie of [cookies.admin, cookies.moderator]) {
      expect((await request(path, "POST", cookie, { code: "000000" })).status).toBe(404);
    }
    // The sign-in challenge (no session) still reaches Better Auth, which
    // rejects it on its own terms because no challenge cookie is present.
    const response = await request(path, "POST", undefined, { code: "000000" });
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("INVALID_TWO_FACTOR_COOKIE");
  }
});

test("enrollment and factor settings cannot be changed through public HTTP", async () => {
  for (const path of ["two-factor/disable", "two-factor/generate-backup-codes", "two-factor/get-totp-uri", "two-factor%2Fdisable"]) {
    for (const cookie of [undefined, ...Object.values(cookies)]) {
      expect((await request(path, "POST", cookie, { password: "test-password-12345" })).status).toBe(404);
    }
  }
});

test("account and session management endpoints are hidden: only the guarded operations serve them", async () => {
  for (const path of [
    "update-user",
    "change-password",
    "change-email",
    "list-sessions",
    "revoke-session",
    "revoke-sessions",
    "revoke-other-sessions",
    "reset-password",
    "update-user/",
    "change-password/",
  ]) {
    for (const cookie of [undefined, cookies.admin, cookies.moderator, cookies.member]) {
      for (const method of ["GET", "POST"]) {
        const response = await request(path, method, cookie, { name: "x", newPassword: "test-password-12345", currentPassword: "test-password-12345", token: "t" });
        expect(response.status).toBe(404);
      }
    }
  }
  // The emailed reset link's GET callback still reaches the provider (it answers on its own terms).
  const callback = await request("reset-password/some-token?callbackURL=%2Fauth%2Freset-password", "GET");
  expect(callback.status).not.toBe(404);
  // Requesting a reset stays reachable (this test instance has no mailer, so the provider refuses on its own terms).
  const requested = await request("request-password-reset", "POST", undefined, { email: "user@example.com", redirectTo: "/auth/reset-password" });
  expect(requested.status).not.toBe(404);
});

test("signed-in sessions cannot complete a factor setup or spend recovery codes over HTTP; anonymous sign-in keeps both", async () => {
  for (const path of ["two-factor/verify-totp", "two-factor/verify-backup-code"]) {
    // A signed-in account that is not in required enrollment: hidden.
    expect((await request(path, "POST", cookies.member, { code: "000000" })).status).toBe(404);
    // Anonymous sign-in challenges still reach the provider, which rejects them for lack of a challenge cookie.
    const anonymous = await request(path, "POST", undefined, { code: "000000" });
    expect(anonymous.status).not.toBe(404);
  }
});
