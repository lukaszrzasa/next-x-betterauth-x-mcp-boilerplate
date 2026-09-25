import { beforeEach, expect, mock, test } from "bun:test";

/** The page factory against a mocked fresh session; redirects throw like Next's do. */

let session = null;
class Redirect extends Error {
  constructor(to) {
    super(`redirect:${to}`);
    this.to = to;
  }
}

mock.module("server-only", () => ({}));
mock.module("next/navigation", () => ({
  redirect: (to) => {
    throw new Redirect(to);
  },
}));
mock.module("../../src/lib/auth/session.ts", () => ({
  getFreshSession: async () => session,
}));

const { page, guard } = await import("../../app/_/access");
const { adminRoutes } = await import("../../app/(AdminModule)/_/routes");
const { authRoutes } = await import("../../app/(AuthModule)/_/routes");
const { systemRoutes } = await import("../../app/(SystemModule)/_/routes");
const { appRoutes } = await import("../../app/_/routes");

const as = (role) => ({ user: { id: role, role }, session: { id: "s" } });
const redirectOf = (promise) =>
  promise.then(
    () => null,
    (error) => (error instanceof Redirect ? error.to : Promise.reject(error)),
  );

beforeEach(() => {
  session = null;
});

test("guests are sent to sign-in; public pages render for anyone", async () => {
  const users = page(authRoutes.adminUsers, () => "users");
  expect(await redirectOf(users({}))).toBe("/auth/sign-in");
  const home = page(appRoutes.home, (_props, current) => `home:${current}`);
  expect(await home({})).toBe("home:null");
});

test("non-staff are sent to the panel; staff without the page's rule to the dashboard", async () => {
  session = as("user");
  expect(await redirectOf(page(adminRoutes.dashboard, () => "x")({}))).toBe("/panel");
  session = as("moderator");
  expect(await redirectOf(page(systemRoutes.auditLogs, () => "x")({}))).toBe("/admin");
  expect(await page(authRoutes.adminUsers, () => "users")({})).toBe("users");
});

test("render receives the props and the resolved session", async () => {
  session = as("admin");
  const audit = page(systemRoutes.auditLogs, async ({ q }, current) => `${q}:${current.user.id}`);
  expect(await audit({ q: "1" })).toBe("1:admin");
  expect((await guard(authRoutes.panel)).user.id).toBe("admin");
});
