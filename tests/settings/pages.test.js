import { beforeEach, expect, mock, test } from "bun:test";

/**
 * The settings page entries and the public confirmation page against a
 * mocked session and mocked reads: the route guard, the explicit enrollment
 * guard, page-specific reads, and the confirmation page's read-only render.
 */

let session = null;
class Redirect extends Error {
  constructor(to) {
    super(`redirect:${to}`);
    this.to = to;
  }
}
const getProfileQuery = mock(async () => ({ name: "Ada" }));
const getAccountQuery = mock(async () => ({ email: "ada@example.com", emailVerified: true, twoFactorEnabled: false, twoFactorRequired: false, pendingEmail: { state: "none" } }));
const listSessionsQuery = mock(async ({ page }) => ({ items: [], page, pageSize: 20, total: 0 }));
const inspectEmailProofQuery = mock(async () => ({ status: "confirmable", purpose: "current", maskedEmail: "a•••@example.com", expiresAt: "2026-09-27T00:00:00.000Z" }));

mock.module("server-only", () => ({}));
mock.module("next/navigation", () => ({
  redirect: (to) => {
    throw new Redirect(to);
  },
  notFound: () => {
    throw new Error("not-found");
  },
  useRouter: () => ({}),
  usePathname: () => "/settings/profile",
  unstable_rethrow: () => {},
}));
mock.module("../../src/lib/auth/session.ts", () => ({ getFreshSession: async () => session }));
mock.module("../../app/(AuthModule)/_/queries.ts", () => ({ getProfileQuery, getAccountQuery, listSessionsQuery, inspectEmailProofQuery }));

const { default: ProfilePage } = await import("../../app/(AuthModule)/settings/profile/page");
const { default: AccountPage } = await import("../../app/(AuthModule)/settings/account/page");
const { default: ConfirmPage } = await import("../../app/(AuthModule)/auth/email-change/confirm/page");
const { default: SettingsIndex } = await import("../../app/(AuthModule)/settings/page");
const { ActionError } = await import("../../src/lib/auth/errors");

const as = (role, overrides = {}) => ({
  user: { id: `${role}-id`, role, name: "N", email: "e@x.y", emailVerified: true, twoFactorEnabled: true, ...overrides },
  session: { id: "s" },
});
const outcome = (promise) =>
  promise.then(
    (value) => ({ rendered: value }),
    (error) => {
      if (error instanceof Redirect) return { redirect: error.to };
      throw error;
    },
  );
const props = (search = {}) => ({ searchParams: Promise.resolve(search), params: Promise.resolve({}) });

beforeEach(() => {
  session = as("user");
  for (const fn of [getProfileQuery, getAccountQuery, listSessionsQuery, inspectEmailProofQuery]) fn.mockClear();
});

test("guests go to sign-in; required-but-unenrolled staff go to enrollment; the index redirects to Profile", async () => {
  session = null;
  expect(await outcome(ProfilePage(props()))).toEqual({ redirect: "/auth/sign-in" });
  expect(await outcome(AccountPage(props()))).toEqual({ redirect: "/auth/sign-in" });
  session = as("moderator", { twoFactorEnabled: false });
  expect(await outcome(ProfilePage(props()))).toEqual({ redirect: "/auth/enroll" });
  expect(await outcome(AccountPage(props()))).toEqual({ redirect: "/auth/enroll" });
  expect(getProfileQuery).not.toHaveBeenCalled();
  expect(getAccountQuery).not.toHaveBeenCalled();
  session = as("user");
  expect(await outcome(SettingsIndex(props()))).toEqual({ redirect: "/settings/profile" });
});

test("every ordinary role reads its own settings; the reads take no caller-supplied identity", async () => {
  for (const role of ["user", "moderator", "admin"]) {
    session = as(role);
    expect((await outcome(ProfilePage(props()))).rendered).toBeTruthy();
    expect((await outcome(AccountPage(props()))).rendered).toBeTruthy();
  }
  expect(getProfileQuery).toHaveBeenCalledWith(undefined);
  expect(getAccountQuery).toHaveBeenCalledWith(undefined);
});

test("the sessions page number comes from the URL, validated; nonsense falls back to page one", async () => {
  await AccountPage(props({ sessions: "3" }));
  expect(listSessionsQuery).toHaveBeenLastCalledWith({ page: 3 });
  await AccountPage(props({ sessions: "-2" }));
  expect(listSessionsQuery).toHaveBeenLastCalledWith({ page: 1 });
  await AccountPage(props({ sessions: "abc" }));
  expect(listSessionsQuery).toHaveBeenLastCalledWith({ page: 1 });
});

test("a refused read after the guard redirects like the guard; an unexpected failure reaches the error boundary", async () => {
  getAccountQuery.mockImplementationOnce(async () => {
    throw new ActionError("FORBIDDEN");
  });
  expect(await outcome(AccountPage(props()))).toEqual({ redirect: "/panel" });
  getProfileQuery.mockImplementationOnce(async () => {
    throw new Error("database unavailable");
  });
  await expect(ProfilePage(props())).rejects.toThrow("database unavailable");
});

test("the confirmation page only inspects a well-formed token on render; it is not guest-only and never confirms", async () => {
  session = as("user");
  const token = "B".repeat(43);
  const rendered = await ConfirmPage({ searchParams: Promise.resolve({ token }) });
  expect(rendered).toBeTruthy();
  expect(inspectEmailProofQuery).toHaveBeenCalledWith({ token });
  inspectEmailProofQuery.mockClear();
  await ConfirmPage({ searchParams: Promise.resolve({ token: "short" }) });
  await ConfirmPage({ searchParams: Promise.resolve({}) });
  await ConfirmPage({ searchParams: Promise.resolve({ token: [token, token] }) });
  expect(inspectEmailProofQuery).not.toHaveBeenCalled();
});
