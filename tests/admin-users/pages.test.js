import { beforeEach, expect, mock, test } from "bun:test";
import { serverIntlMock } from "../helpers/intl";

/**
 * The two page entries against a mocked session and mocked reads: the guard,
 * the canonical-URL redirect, page clamping, refusal after the guard, and
 * not-found only after authorization.
 */

let session = null;
class Redirect extends Error {
  constructor(to) {
    super(`redirect:${to}`);
    this.to = to;
  }
}
class NotFound extends Error {}
const listUsersQuery = mock();
const getUserQuery = mock();

mock.module("server-only", () => ({}));
mock.module("next-intl/server", serverIntlMock());
mock.module("next/navigation", () => ({
  redirect: (to) => {
    throw new Redirect(to);
  },
  notFound: () => {
    throw new NotFound("not-found");
  },
  // Client components imported by the pages reference these; none run here.
  useRouter: () => ({}),
  usePathname: () => "/",
  unstable_rethrow: () => {},
}));
mock.module("../../src/lib/auth/session.ts", () => ({ getFreshSession: async () => session }));
mock.module("../../app/(AuthModule)/admin/_/queries.ts", () => ({ listUsersQuery, getUserQuery }));

const { default: UsersPage } = await import("../../app/(AuthModule)/admin/users/(list)/page");
const { default: UserPage } = await import("../../app/(AuthModule)/admin/users/[userId]/page");
const { ActionError } = await import("../../src/lib/auth/errors");
const { USERS_QUERY_DEFAULTS } = await import("../../app/(AuthModule)/admin/_/queryState");

const as = (role) => ({ user: { id: `${role}-id`, role, name: "N", email: "e@x.y" }, session: { id: "s" } });
const outcome = (promise) =>
  promise.then(
    (value) => ({ rendered: value }),
    (error) => {
      if (error instanceof Redirect) return { redirect: error.to };
      if (error instanceof NotFound) return { notFound: true };
      throw error;
    },
  );
const listProps = (search = {}) => ({ searchParams: Promise.resolve(search), params: Promise.resolve({}) });
const detailProps = (userId, search = {}) => ({ params: Promise.resolve({ userId }), searchParams: Promise.resolve(search) });
const pageOf = (query, total = 0) => ({ items: [], total, page: query.page, pageSize: query.pageSize, query });

beforeEach(() => {
  session = as("admin");
  listUsersQuery.mockReset();
  getUserQuery.mockReset();
  listUsersQuery.mockImplementation(async (query) => pageOf(query));
  getUserQuery.mockImplementation(async ({ userId }) => ({ id: userId, name: "Target", capabilities: {} }));
});

test("list: guests and non-staff never reach the read; staff without list permission are sent to the dashboard", async () => {
  session = null;
  expect(await outcome(UsersPage(listProps()))).toEqual({ redirect: "/auth/sign-in" });
  session = as("user");
  expect(await outcome(UsersPage(listProps()))).toEqual({ redirect: "/panel" });
  expect(listUsersQuery).not.toHaveBeenCalled();
});

test("list: the URL is normalized only after authorization and only when it differs", async () => {
  expect(await outcome(UsersPage(listProps({ page: "1", role: "superuser", junk: "x" })))).toEqual({
    redirect: "/admin/users",
  });
  expect(listUsersQuery).not.toHaveBeenCalled();
  expect(await outcome(UsersPage(listProps({ role: "admin", q: "a" })))).toEqual({
    redirect: "/admin/users?q=a&role=admin",
  });
  const rendered = await outcome(UsersPage(listProps({ q: "a", role: "admin" })));
  expect(rendered.rendered).toBeTruthy();
  expect(listUsersQuery).toHaveBeenCalledWith({ ...USERS_QUERY_DEFAULTS, q: "a", role: "admin" });
  session = null;
  expect(await outcome(UsersPage(listProps({ page: "1" })))).toEqual({ redirect: "/auth/sign-in" });
});

test("list: a page past the end redirects to the clamped canonical URL", async () => {
  listUsersQuery.mockImplementation(async (query) => ({ ...pageOf({ ...query, page: 3 }, 60), page: 3 }));
  expect(await outcome(UsersPage(listProps({ page: "9" })))).toEqual({ redirect: "/admin/users?page=3" });
  listUsersQuery.mockImplementation(async (query) => pageOf({ ...query, page: 1 }));
  expect(await outcome(UsersPage(listProps({ page: "9" })))).toEqual({ redirect: "/admin/users" });
});

test("list: a refusal from the read follows the page policy; other failures reach the error boundary", async () => {
  listUsersQuery.mockImplementation(async () => {
    throw new ActionError("FORBIDDEN");
  });
  expect(await outcome(UsersPage(listProps()))).toEqual({ redirect: "/admin" });
  listUsersQuery.mockImplementation(async () => {
    throw new ActionError("INTERNAL");
  });
  await expect(UsersPage(listProps())).rejects.toMatchObject({ reason: "INTERNAL" });
});

test("detail: only staff with get may open it; the read's own refusal redirects", async () => {
  session = null;
  expect(await outcome(UserPage(detailProps("u1")))).toEqual({ redirect: "/auth/sign-in" });
  session = as("user");
  expect(await outcome(UserPage(detailProps("u1")))).toEqual({ redirect: "/panel" });
  expect(getUserQuery).not.toHaveBeenCalled();
  session = as("moderator");
  expect((await outcome(UserPage(detailProps("u1")))).rendered).toBeTruthy();
  getUserQuery.mockImplementation(async () => {
    throw new ActionError("FORBIDDEN");
  });
  expect(await outcome(UserPage(detailProps("u1")))).toEqual({ redirect: "/admin" });
});

test("detail: unknown and malformed IDs are not-found, but only for authorized viewers", async () => {
  getUserQuery.mockImplementation(async () => null);
  expect(await outcome(UserPage(detailProps("missing")))).toEqual({ notFound: true });
  expect(await outcome(UserPage(detailProps("a/b")))).toEqual({ notFound: true });
  expect(await outcome(UserPage(detailProps("x".repeat(200))))).toEqual({ notFound: true });
  expect(getUserQuery).toHaveBeenCalledTimes(1);
  session = as("user");
  expect(await outcome(UserPage(detailProps("a/b")))).toEqual({ redirect: "/panel" });
  session = null;
  expect(await outcome(UserPage(detailProps("a/b")))).toEqual({ redirect: "/auth/sign-in" });
});

test("detail: the way back is the validated returnTo, and only with list permission", async () => {
  const good = await UserPage(detailProps("u1", { returnTo: "/admin/users?role=admin&page=2&bogus=1" }));
  const json = JSON.stringify(good, (key, value) => (key === "_owner" ? undefined : value));
  expect(json).toContain("/admin/users?role=admin&page=2");
  expect(json).not.toContain("bogus");
  const bad = JSON.stringify(await UserPage(detailProps("u1", { returnTo: "https://evil.example/admin/users" })));
  expect(bad).toContain('"listUrl":"/admin/users"');
  expect(bad).not.toContain("evil.example");
});
