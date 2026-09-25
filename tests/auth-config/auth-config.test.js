import { expect, mock, test } from "bun:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { can, statement } from "../../src/lib/auth/permissions";

mock.module("server-only", () => ({}));
mock.module("../../src/lib/db/index.ts", () => ({ db: {} }));
mock.module("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: () => memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [] }),
}));
const storage = new Map();
mock.module("../../src/lib/redis/index.ts", () => ({ redisSecondaryStorage: {
  get: async (key) => storage.get(key) ?? null,
  set: async (key, value) => { storage.set(key, value); },
  delete: async (key) => { storage.delete(key); },
  getAndDelete: async (key) => { const value = storage.get(key); storage.delete(key); return value; },
  increment: async () => 1,
} }));
mock.module("../../src/lib/email/index.tsx", () => ({
  sendPasswordResetEmail: mock(),
  sendTwoFactorOtpEmail: mock(),
  sendVerificationEmail: mock(),
}));

// Import the actual application configuration; replace only external services.
const { auth } = await import("../../src/lib/auth/index.ts");

test("plugin and application permissions agree for every declared permission", async () => {
  // `admin` is built from the whole statement, so anything declared there is
  // granted without a second list; this walks the catalogue as declared.
  for (const role of ["admin", "moderator", "user", "unknown", "admin,moderator"]) {
    for (const [resource, actions] of Object.entries(statement)) {
      for (const action of actions) {
        const plugin = await auth.api.userHasPermission({ body: { role, permissions: { [resource]: [action] } } });
        expect(plugin.success).toBe(can(role, `${resource}.${action}`));
        if (role === "admin") expect(plugin.success).toBe(true);
      }
    }
  }
  expect(can("admin", "unknown.read")).toBe(false);
  expect(can("admin", [])).toBe(false);
});

test("2FA requirement is server-owned and independent of enrollment", async () => {
  const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ email: "requirement@example.com", name: "Test", password: "test-password-12345", twoFactorRequired: true }),
  }));
  expect(response.status).toBe(200);
  const { user } = await response.json();
  expect(user.twoFactorRequired).toBe(false);
  const ctx = await auth.$context;
  await ctx.internalAdapter.updateUser(user.id, { twoFactorRequired: true });
  const update = await auth.handler(new Request("http://localhost:3000/api/auth/update-user", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json", cookie: response.headers.get("set-cookie").split(";")[0] },
    body: JSON.stringify({ name: "Updated", twoFactorRequired: false }),
  }));
  expect(update.status).toBe(200);
  const saved = await ctx.internalAdapter.findUserById(user.id);
  expect(saved.twoFactorRequired).toBe(true);
  expect(saved.twoFactorEnabled).toBeFalsy();
});

test("application auth no longer exposes magic-link sign-in or verification", async () => {
  expect(auth.options.plugins.some((plugin) => plugin.id === "magic-link")).toBe(false);
  for (const [path, method] of [["sign-in/magic-link", "POST"], ["magic-link/verify?token=previously-issued-token", "GET"]]) {
    const response = await auth.handler(new Request(`http://localhost:3000/api/auth/${path}`, {
      method,
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify({ email: "staff@example.com" }) } : {}),
    }));
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  }
});


const mail = await import("../../src/lib/email/index.tsx");
function authRequest(path, body, cookie) {
  return auth.handler(new Request(`http://localhost:3000/api/auth/${path}`, {
    method: body ? "POST" : "GET", headers: { origin: "http://localhost:3000", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
}
function responseCookies(response) { return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; "); }

test("sign-up sends the application confirmation URL and verification works without a session", async () => {
  const signedUp = await authRequest("sign-up/email", { email: "verify@example.com", name: "Verify", password: "test-password-12345" });
  expect(signedUp.status).toBe(200);
  expect((await signedUp.clone().json()).user.emailVerified).toBe(false);
  expect(responseCookies(signedUp)).toContain("session_token");
  const message = mail.sendVerificationEmail.mock.calls.at(-1)[0];
  const link = new URL(message.url);
  expect(link.pathname).toBe("/auth/email-confirmation");
  const confirmed = await authRequest(`verify-email?token=${encodeURIComponent(link.searchParams.get("token"))}`);
  expect(confirmed.status).toBe(200);
  const me = await auth.api.getSession({ headers: new Headers({ cookie: responseCookies(signedUp) }) });
  // Verify the persisted result independently of the pre-verification session snapshot.
  const ctx = await auth.$context;
  expect((await ctx.internalAdapter.findUserById(me.user.id)).emailVerified).toBe(true);
  expect((await authRequest("verify-email?token=invalid")).status).toBe(401);
});

test("the sign-in email code refuses an unverified address, like step-up does", async () => {
  const credentials = { email: "otp@example.com", name: "Otp", password: "test-password-12345" };
  const registered = await authRequest("sign-up/email", credentials);
  expect(registered.status).toBe(200);
  const ctx = await auth.$context;
  const userId = (await registered.json()).user.id;
  // An enrolled authenticator turns password sign-in into a challenge.
  await ctx.internalAdapter.updateUser(userId, { twoFactorEnabled: true });

  const challenge = await authRequest("sign-in/email", { email: credentials.email, password: credentials.password });
  expect((await challenge.json()).twoFactorRedirect).toBe(true);
  const challengeCookie = responseCookies(challenge);
  expect(challengeCookie).toContain("two_factor");

  const refused = await authRequest("two-factor/send-otp", {}, challengeCookie);
  expect(refused.status).toBe(403);
  expect((await refused.json()).code).toBe("EMAIL_NOT_VERIFIED");
  expect(mail.sendTwoFactorOtpEmail).not.toHaveBeenCalled();

  await ctx.internalAdapter.updateUser(userId, { emailVerified: true });
  expect((await authRequest("two-factor/send-otp", {}, challengeCookie)).status).toBe(200);
  expect(mail.sendTwoFactorOtpEmail).toHaveBeenCalledTimes(1);
});

test("password reset is single-use, revokes sessions, and preserves enabled 2FA", async () => {
  const credentials = { email: "reset@example.com", name: "Reset", password: "test-password-12345" };
  const registered = await authRequest("sign-up/email", credentials);
  expect(registered.status).toBe(200);
  const oldCookie = responseCookies(registered);
  const userId = (await registered.json()).user.id;
  const ctx = await auth.$context;
  await ctx.internalAdapter.updateUser(userId, { twoFactorEnabled: true });
  const requested = await authRequest("request-password-reset", { email: credentials.email, redirectTo: "http://localhost:3000/auth/reset-password" });
  expect(requested.status).toBe(200);
  const link = new URL(mail.sendPasswordResetEmail.mock.calls.at(-1)[0].url);
  const token = link.pathname.split("/").at(-1);
  const reset = await authRequest("reset-password", { token, newPassword: "new-test-password-456" });
  expect(reset.status).toBe(200);
  // Access checks read the store, so the revoked session is rejected at once.
  expect(await auth.api.getSession({ headers: new Headers({ cookie: oldCookie }), query: { disableCookieCache: true } })).toBeNull();
  // The signed cookie cache is not revocable; it stays readable until `maxAge`.
  expect(await auth.api.getSession({ headers: new Headers({ cookie: oldCookie }) })).not.toBeNull();
  expect((await ctx.internalAdapter.findUserById(userId)).twoFactorEnabled).toBe(true);
  expect((await authRequest("reset-password", { token, newPassword: "another-password-789" })).status).toBe(400);
  expect((await authRequest("sign-in/email", { email: credentials.email, password: credentials.password })).status).toBe(401);
  const login = await authRequest("sign-in/email", { email: credentials.email, password: "new-test-password-456" });
  expect(await login.json()).toMatchObject({ twoFactorRedirect: true });
});

test("the password-reset cutoff is server-owned, never client-set and never returned", async () => {
  const signUp = (body) => auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ email: "cutoff@example.com", name: "Cut", password: "test-password-12345", ...body }),
  }));
  const refused = await signUp({ passwordResetInvalidBefore: "2020-01-01T00:00:00.000Z" });
  expect(refused.status).toBe(400);
  expect((await refused.json()).code).toBe("FIELD_NOT_ALLOWED");
  const response = await signUp({});
  expect(response.status).toBe(200);
  const { user } = await response.json();
  expect(user).not.toHaveProperty("passwordResetInvalidBefore");
  const ctx = await auth.$context;
  expect((await ctx.internalAdapter.findUserById(user.id)).passwordResetInvalidBefore ?? null).toBeNull();
  await ctx.internalAdapter.updateUser(user.id, { passwordResetInvalidBefore: new Date("2026-01-01T00:00:00.000Z") });
  const session = await auth.api.getSession({ headers: new Headers({ cookie: response.headers.get("set-cookie").split(";")[0] }), query: { disableCookieCache: true } });
  expect(session.user).not.toHaveProperty("passwordResetInvalidBefore");
});

test("the admin plugin applies no default ban expiry: a permanent ban stores no expiry", () => {
  const plugin = auth.options.plugins.find((entry) => entry.id === "admin");
  expect(plugin).toBeTruthy();
  const options = auth.options.plugins.find((entry) => entry.id === "admin")?.options ?? {};
  expect(options.defaultBanExpiresIn).toBeUndefined();
  expect(options.defaultBanReason).toBeUndefined();
});
