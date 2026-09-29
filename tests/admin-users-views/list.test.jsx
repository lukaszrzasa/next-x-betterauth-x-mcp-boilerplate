import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDom } from "../helpers/dom";

installDom();

const push = mock();
const replace = mock();
mock.module("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: () => {} }),
  usePathname: () => "/admin/users",
}));

const React = await import("react");
const { render, fireEvent, screen, cleanup, within } = await import("@testing-library/react");
const { ViewerProvider } = await import("../../src/components/shell/ViewerProvider");
const { UsersList } = await import("../../app/(AuthModule)/admin/_/components/users/list/UsersList");
const { USERS_QUERY_DEFAULTS } = await import("../../app/(AuthModule)/admin/_/queryState");
const { SEARCH_DEBOUNCE_MS } = await import("../../src/lib/data-table/useTableNavigation");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const items = [
  {
    id: "u-ada",
    name: "Ada Lovelace",
    email: "ada@example.com",
    image: null,
    roles: ["admin"],
    emailVerified: true,
    accessStatus: "active",
    banExpires: null,
    createdAt: "2026-09-01T10:00:00.000Z",
  },
  {
    id: "u-grace",
    name: "Grace Hopper",
    email: "grace@example.com",
    image: null,
    roles: ["user", "wizard"],
    emailVerified: false,
    accessStatus: "temporarily-banned",
    banExpires: "2026-10-01T12:30:00.000Z",
    createdAt: "2026-08-15T09:00:00.000Z",
  },
];
const pageOf = (overrides = {}) => ({
  items,
  total: 2,
  page: 1,
  pageSize: 25,
  query: USERS_QUERY_DEFAULTS,
  ...overrides,
});

function renderList(page, role = "admin") {
  return render(
    <ViewerProvider viewer={{ name: "Viewer", email: "v@example.com", image: null, role }}>
      <UsersList page={page} />
    </ViewerProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});
afterEach(cleanup);

test("rows show identity, roles, verification, effective access and UTC dates; links open the detail", () => {
  renderList(pageOf());
  const rows = screen.getAllByRole("row").slice(1);
  expect(rows).toHaveLength(2);
  const grace = within(rows[1]);
  expect(grace.getByRole("link", { name: "Grace Hopper" }).getAttribute("href")).toBe("/admin/users/u-grace");
  expect(grace.getByRole("link", { name: "View user Grace Hopper" })).toBeTruthy();
  expect(grace.getByText("grace@example.com")).toBeTruthy();
  const roles = grace.getByRole("list", { name: "Roles" });
  expect(within(roles).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["User", "wizard"]);
  expect(grace.getByText("Unverified")).toBeTruthy();
  expect(grace.getByText("Temporarily banned").getAttribute("title")).toBe("Ban ends 1 Oct 2026, 12:30 UTC");
  expect(grace.getByText("15 Aug 2026").getAttribute("datetime")).toBe("2026-08-15T09:00:00.000Z");
  expect(document.querySelector("tr[onclick]")).toBeNull();
});

test("detail links carry the list state back and disappear without the get permission", () => {
  const view = renderList(pageOf({ query: { ...USERS_QUERY_DEFAULTS, q: "a", page: 2 } }));
  expect(screen.getByRole("link", { name: "Ada Lovelace" }).getAttribute("href")).toBe(
    "/admin/users/u-ada?returnTo=%2Fadmin%2Fusers%3Fq%3Da%26page%3D2",
  );
  view.unmount();
  renderList(pageOf(), "user");
  expect(screen.queryByRole("link", { name: "Ada Lovelace" })).toBeNull();
  expect(screen.queryByRole("link", { name: /View user/ })).toBeNull();
  expect(screen.getByText("Ada Lovelace")).toBeTruthy();
});

test("filters push a canonical URL with the page reset; search debounces and Enter flushes", async () => {
  renderList(pageOf({ query: { ...USERS_QUERY_DEFAULTS, page: 3 } }));
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: "moderator" } });
  expect(push).toHaveBeenLastCalledWith("/admin/users?role=moderator", { scroll: false });
  fireEvent.change(screen.getByLabelText("Access"), { target: { value: "banned" } });
  expect(push).toHaveBeenLastCalledWith("/admin/users?status=banned", { scroll: false });
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "email:asc" } });
  expect(push).toHaveBeenLastCalledWith("/admin/users?sort=email&direction=asc", { scroll: false });

  const search = screen.getByLabelText("Search users");
  fireEvent.change(search, { target: { value: "gr" } });
  fireEvent.change(search, { target: { value: "grace " } });
  expect(replace).not.toHaveBeenCalled();
  fireEvent.submit(search.closest("form"));
  expect(replace).toHaveBeenLastCalledWith("/admin/users?q=grace", { scroll: false });
  fireEvent.change(search, { target: { value: "hop" } });
  await wait(SEARCH_DEBOUNCE_MS + 30);
  expect(replace).toHaveBeenLastCalledWith("/admin/users?q=hop", { scroll: false });
  expect(replace).toHaveBeenCalledTimes(2);
});

test("sorting from the header, paging and page size all become URL state", () => {
  renderList(pageOf({ total: 80, page: 2, query: { ...USERS_QUERY_DEFAULTS, page: 2 } }));
  fireEvent.click(screen.getByRole("button", { name: "Sort by User, ascending" }));
  expect(push).toHaveBeenLastCalledWith("/admin/users?sort=name&direction=asc", { scroll: false });
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(push).toHaveBeenLastCalledWith("/admin/users?page=3", { scroll: false });
  fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "50" } });
  expect(push).toHaveBeenLastCalledWith("/admin/users?pageSize=50", { scroll: false });
  expect(screen.getByText("26–50 of 80 users")).toBeTruthy();
  // The default createdAt sort shows as descending on the Created column.
  expect(screen.getAllByRole("columnheader")[4].getAttribute("aria-sort")).toBe("descending");
});

test("the search box follows the URL on history navigation and clear filters keeps sort and size", () => {
  const filtered = { ...USERS_QUERY_DEFAULTS, q: "ada", role: "admin", sort: "name", direction: "asc", pageSize: 50, page: 2 };
  const view = renderList(pageOf({ query: filtered }));
  expect(screen.getByLabelText("Search users").value).toBe("ada");
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(push).toHaveBeenLastCalledWith("/admin/users?sort=name&direction=asc&pageSize=50", { scroll: false });
  view.rerender(
    <ViewerProvider viewer={{ name: "Viewer", email: "v@example.com", image: null, role: "admin" }}>
      <UsersList page={pageOf({ query: { ...USERS_QUERY_DEFAULTS, q: "back" } })} />
    </ViewerProvider>,
  );
  expect(screen.getByLabelText("Search users").value).toBe("back");
});

test("empty states distinguish no users from no matches, without a create button", () => {
  const view = renderList(pageOf({ items: [], total: 0 }));
  expect(screen.getByText("No users yet.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  expect(screen.queryByText(/Create user/)).toBeNull();
  view.unmount();
  renderList(pageOf({ items: [], total: 0, query: { ...USERS_QUERY_DEFAULTS, verified: "no" } }));
  expect(screen.getByText("No users match these filters.")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
  expect(push).toHaveBeenLastCalledWith("/admin/users", { scroll: false });
  expect(screen.getByText("0 users")).toBeTruthy();
});
