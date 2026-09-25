import { beforeAll, expect, mock, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { admin } from "better-auth/plugins";
import { ac, roles } from "../../src/lib/auth/permissions";

const baseURL = "http://localhost:3000";
const auth = betterAuth({
  baseURL,
  secret: "test-only-secret-with-at-least-thirty-two-characters",
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  emailAndPassword: { enabled: true },
  plugins: [admin({ ac, roles })],
});

// Run in a separate process from builder tests, which mock this same module.
mock.module("../../src/lib/auth/index.ts", () => ({ auth }));
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


test("enrollment and factor settings cannot be changed through public HTTP", async () => {
  for (const path of ["two-factor/disable", "two-factor/generate-backup-codes", "two-factor/get-totp-uri", "two-factor%2Fdisable"]) {
    for (const cookie of [undefined, ...Object.values(cookies)]) {
      expect((await request(path, "POST", cookie, { password: "test-password-12345" })).status).toBe(404);
    }
  }
});
