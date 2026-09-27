import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

/**
 * The proxy handles installation and enrollment only; page access is the
 * page's own declaration. Runs in its own process: the auth module is mocked.
 */

let installed = true;
let cachedUser = null;
let sessionCookiePresent = false;
let storeUser = null;
let storeSetCookies = [];

const getSession = mock(async () => {
  const headers = new Headers();
  for (const cookie of storeSetCookies) headers.append("set-cookie", cookie);
  return { headers, response: storeUser ? { user: storeUser } : null };
});
const getCookieCache = mock(async () => (cachedUser ? { user: cachedUser } : null));
const getSessionCookie = mock(() => (sessionCookiePresent ? "token" : null));

mock.module("server-only", () => ({}));
mock.module("../../src/lib/auth/index.ts", () => ({
  auth: { api: { getSession } },
  sessionCookieCache: { enabled: true, maxAge: 300, strategy: "jwe" },
}));
mock.module("../../src/lib/auth/installation.ts", () => ({
  isInstallationComplete: async () => installed,
}));
mock.module("better-auth/cookies", () => ({ getCookieCache, getSessionCookie }));

const { proxy } = await import("../../proxy");

const request = (path, method = "GET") =>
  new NextRequest(`http://localhost:3000${path}`, { method });
const location = (response) => {
  const value = response.headers.get("location");
  return value ? new URL(value).pathname : null;
};

beforeEach(() => {
  installed = true;
  cachedUser = null;
  sessionCookiePresent = false;
  storeUser = null;
  storeSetCookies = [];
  getSession.mockClear();
  getCookieCache.mockClear();
});

test("installation redirect retains precedence", async () => {
  installed = false;
  expect(location(await proxy(request("/admin")))).toBe("/auth/setup");
  expect((await proxy(request("/api/anything", "POST"))).status).toBe(503);
  expect(getSession).not.toHaveBeenCalled();
});

test("enrolling staff reach only enrollment pages; the cache answers first", async () => {
  cachedUser = { role: "admin", twoFactorEnabled: false };
  expect(location(await proxy(request("/admin")))).toBe("/auth/enroll");
  expect((await proxy(request("/admin/users", "POST"))).status).toBe(403);
  expect((await proxy(request("/auth/enroll"))).status).toBe(200);
  expect((await proxy(request("/api/auth/get-session"))).status).toBe(200);
  expect(getSession).not.toHaveBeenCalled();
});

test("page access is not decided here: guests and any role pass through", async () => {
  expect((await proxy(request("/admin/audit-logs"))).status).toBe(200);
  cachedUser = { role: "user" };
  expect((await proxy(request("/admin/audit-logs"))).status).toBe(200);
});

test("an expired cache is re-issued from the store and the cookies survive", async () => {
  sessionCookiePresent = true;
  storeUser = { role: "user" };
  storeSetCookies = ["session_data=refreshed; Path=/"];
  const response = await proxy(request("/panel"));
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie()).toEqual(storeSetCookies);
  expect(getSession).toHaveBeenCalledTimes(1);
});

test("the email-change confirmation page stays reachable while enrollment is required", async () => {
  cachedUser = { role: "admin", twoFactorRequired: true, twoFactorEnabled: false };
  const response = await proxy(request("/auth/email-change/confirm?token=abc"));
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(location(await proxy(request("/settings/account")))).toBe("/auth/enroll");
});
