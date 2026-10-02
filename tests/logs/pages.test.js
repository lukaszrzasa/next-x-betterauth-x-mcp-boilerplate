import { beforeEach, expect, mock, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The two list pages against a mocked session and mocked reads: the route
 * guard, canonicalization only after authorization, page clamping (which
 * keeps the email list's selection), refusal after the guard, and the
 * absence of any standalone detail route or write controls.
 */

let session = null;
class Redirect extends Error {
  constructor(to) {
    super(`redirect:${to}`);
    this.to = to;
  }
}
class NotFound extends Error {}
const listEmailLogsQuery = mock();
const listStaffLogsQuery = mock();
const listStaffLogFilterOptionsQuery = mock();

import { serverIntlMock } from "../helpers/intl.jsx";

mock.module("server-only", () => ({}));
mock.module("next-intl/server", serverIntlMock());
mock.module("next/navigation", () => ({
  redirect: (to) => {
    throw new Redirect(to);
  },
  notFound: () => {
    throw new NotFound("not-found");
  },
  useRouter: () => ({}),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  unstable_rethrow: () => {},
}));
mock.module("../../src/lib/auth/session.ts", () => ({ getFreshSession: async () => session }));
mock.module("../../app/(LogsModule)/admin/_/queries.ts", () => ({
  listEmailLogsQuery,
  listStaffLogsQuery,
  listStaffLogFilterOptionsQuery,
}));

const { default: EmailLogsPage } = await import("../../app/(LogsModule)/admin/email-logs/page");
const { default: StaffLogsPage } = await import("../../app/(LogsModule)/admin/staff-logs/page");
const { ActionError } = await import("../../src/lib/auth/errors");
const { EMAIL_LOGS_QUERY_DEFAULTS, STAFF_LOGS_QUERY_DEFAULTS } = await import("../../app/(LogsModule)/admin/_/queryState");

const LOG_ID = "01900000-0000-7000-8000-000000000001";
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
const props = (search = {}) => ({ searchParams: Promise.resolve(search), params: Promise.resolve({}) });
const pageOf = (query, total = 0) => ({ items: [], total, page: query.page, pageSize: query.pageSize, query, asOf: "", range: {} });
const filterOptions = { actors: [{ id: "admin-id", name: "N" }], actions: ["user.banned"] };

beforeEach(() => {
  session = as("admin");
  for (const read of [listEmailLogsQuery, listStaffLogsQuery]) {
    read.mockReset();
    read.mockImplementation(async (query) => pageOf(query));
  }
  listStaffLogFilterOptionsQuery.mockReset();
  listStaffLogFilterOptionsQuery.mockImplementation(async () => filterOptions);
});

const pages = [
  ["/admin/email-logs", EmailLogsPage, listEmailLogsQuery, EMAIL_LOGS_QUERY_DEFAULTS],
  ["/admin/staff-logs", StaffLogsPage, listStaffLogsQuery, STAFF_LOGS_QUERY_DEFAULTS],
];

test("guests go to sign-in, non-staff to the panel, moderators to the dashboard - before any read", async () => {
  for (const [, Page, read] of pages) {
    session = null;
    expect(await outcome(Page(props()))).toEqual({ redirect: "/auth/sign-in" });
    session = as("user");
    expect(await outcome(Page(props()))).toEqual({ redirect: "/panel" });
    session = as("moderator");
    expect(await outcome(Page(props()))).toEqual({ redirect: "/admin" });
    expect(read).not.toHaveBeenCalled();
  }
  expect(listStaffLogFilterOptionsQuery).not.toHaveBeenCalled();
});

test("an admin sees the list rendered with the canonical default query", async () => {
  for (const [, Page, read, defaults] of pages) {
    const result = await outcome(Page(props()));
    expect(result.rendered).toBeTruthy();
    expect(read).toHaveBeenCalledWith(defaults);
  }
  expect(listStaffLogFilterOptionsQuery).toHaveBeenCalledTimes(1);
});

test("email logs: non-canonical URLs redirect to the canonical form after authorization, keeping a valid selection", async () => {
  const [path, Page, read] = pages[0];
  session = as("user");
  expect(await outcome(Page(props({ page: "0", unknown: "1" })))).toEqual({ redirect: "/panel" });
  expect(read).not.toHaveBeenCalled();
  session = as("admin");
  expect(await outcome(Page(props({ unknown: "1", pageSize: "25", log: LOG_ID })))).toEqual({
    redirect: `${path}?log=${LOG_ID}`,
  });
  expect(await outcome(Page(props({ log: "not-a-uuid", q: " x " })))).toEqual({ redirect: `${path}?q=x` });
  const lettered = "0190abcd-0000-7000-8000-00000000beef";
  expect(await outcome(Page(props({ log: lettered.toUpperCase() })))).toEqual({ redirect: `${path}?log=${lettered}` });
  const canonical = await outcome(Page(props({ q: "x", log: LOG_ID })));
  expect(canonical.rendered).toBeTruthy();
});

test("staff log: non-canonical URLs redirect to the canonical form after authorization; there is no selection", async () => {
  const [path, Page, read] = pages[1];
  session = as("user");
  expect(await outcome(Page(props({ page: "0", unknown: "1" })))).toEqual({ redirect: "/panel" });
  expect(read).not.toHaveBeenCalled();
  expect(listStaffLogFilterOptionsQuery).not.toHaveBeenCalled();
  session = as("admin");
  expect(await outcome(Page(props({ unknown: "1", pageSize: "25" })))).toEqual({ redirect: path });
  expect(await outcome(Page(props({ log: LOG_ID, q: " x " })))).toEqual({ redirect: `${path}?q=x` });
  expect(await outcome(Page(props({ action: "User.Banned", actor: " admin-id " })))).toEqual({
    redirect: `${path}?actor=admin-id`,
  });
  expect(await outcome(Page(props({ resourceType: "user", resourceId: "user-42" })))).toEqual({
    redirect: `${path}?resourceId=user-42`,
  });
  // Canonical order: a URL whose parameters are valid but out of order is rewritten.
  expect(await outcome(Page(props({ resourceId: "user-42", action: "user.banned" })))).toEqual({
    redirect: `${path}?action=user.banned&resourceId=user-42`,
  });
  read.mockClear();
  const canonical = await outcome(Page(props({ q: "x", actor: "admin-id", action: "user.banned", resourceId: "user-42" })));
  expect(canonical.rendered).toBeTruthy();
  expect(read).toHaveBeenCalledWith({
    ...STAFF_LOGS_QUERY_DEFAULTS,
    q: "x",
    actorId: "admin-id",
    actions: ["user.banned"],
    resourceId: "user-42",
  });
});

test("a page past the end folds onto the last page, the selection preserved", async () => {
  for (const [, , read] of pages) {
    read.mockImplementation(async (query) => ({ ...pageOf(query, 30), page: 2, query: { ...query, page: 2 } }));
  }
  expect(await outcome(EmailLogsPage(props({ page: "9", log: LOG_ID })))).toEqual({
    redirect: `/admin/email-logs?page=2&log=${LOG_ID}`,
  });
  expect(await outcome(StaffLogsPage(props({ page: "9", resourceId: "user-42" })))).toEqual({
    redirect: "/admin/staff-logs?resourceId=user-42&page=2",
  });
});

test("a refusal after the guard follows the same policy; a missing read is not-found; failures propagate", async () => {
  for (const [, Page, read] of pages) {
    read.mockImplementationOnce(async () => {
      throw new ActionError("FORBIDDEN");
    });
    expect(await outcome(Page(props()))).toEqual({ redirect: "/admin" });
    read.mockImplementationOnce(async () => {
      throw new ActionError("NOT_FOUND");
    });
    expect(await outcome(Page(props()))).toEqual({ notFound: true });
    read.mockImplementationOnce(async () => {
      throw new ActionError("INTERNAL");
    });
    await expect(Page(props())).rejects.toMatchObject({ reason: "INTERNAL" });
  }
});

test("staff log: a refused or failed filter-options read is treated like the list's", async () => {
  listStaffLogFilterOptionsQuery.mockImplementationOnce(async () => {
    throw new ActionError("FORBIDDEN");
  });
  expect(await outcome(StaffLogsPage(props()))).toEqual({ redirect: "/admin" });
  listStaffLogFilterOptionsQuery.mockImplementationOnce(async () => {
    throw new ActionError("NOT_FOUND");
  });
  expect(await outcome(StaffLogsPage(props()))).toEqual({ notFound: true });
  listStaffLogFilterOptionsQuery.mockImplementationOnce(async () => {
    throw new ActionError("INTERNAL");
  });
  await expect(StaffLogsPage(props())).rejects.toMatchObject({ reason: "INTERNAL" });
});

test("no standalone detail route exists: each list directory holds only its entry files", () => {
  const root = join(import.meta.dir, "../../app/(LogsModule)/admin");
  for (const list of ["email-logs", "staff-logs"]) {
    const entries = readdirSync(join(root, list));
    expect(entries.sort()).toEqual(["error.tsx", "loading.tsx", "page.tsx"]);
    for (const entry of entries) expect(statSync(join(root, list, entry)).isFile()).toBe(true);
  }
  // Only the two lists and the admin scope live under the module's admin segment.
  expect(readdirSync(root).sort()).toEqual(["_", "email-logs", "staff-logs"]);
});
