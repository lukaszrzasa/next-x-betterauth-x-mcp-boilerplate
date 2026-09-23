import { expect, mock, test } from "bun:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { can, statement } from "../../src/lib/auth/permissions";

mock.module("server-only", () => ({}));
mock.module("../../src/lib/db/index.ts", () => ({ db: {} }));
mock.module("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: () => memoryAdapter({ user: [], session: [], account: [], verification: [] }),
}));
mock.module("../../src/lib/redis/index.ts", () => ({ redisSecondaryStorage: undefined }));
mock.module("../../src/lib/email/index.tsx", () => ({
  sendPasswordResetEmail: mock(),
  sendTwoFactorOtpEmail: mock(),
  sendVerificationEmail: mock(),
}));

// Import the actual application configuration; replace only external services.
const { auth } = await import("../../src/lib/auth/index.ts");

test("plugin and application permissions agree, including future declared permissions", async () => {
  // The shared catalogue grows without requiring a second admin grant list.
  statement.testResource = ["read", "write"];
  try {
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
  } finally {
    delete statement.testResource;
  }
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
