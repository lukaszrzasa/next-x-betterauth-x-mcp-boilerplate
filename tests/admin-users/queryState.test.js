import { describe, expect, test } from "bun:test";

import {
  clampUsersPage,
  clearUsersFilters,
  hasUsersFilters,
  parseUsersQuery,
  resolveReturnTo,
  serializeUsersQuery,
  userDetailUrl,
  USERS_QUERY_DEFAULTS,
  usersListUrl,
  withUsersQueryChange,
} from "../../app/(AuthModule)/admin/_/queryState";
import { usersQuerySchema } from "../../app/(AuthModule)/admin/_/schema";

describe("parsing", () => {
  test("an empty URL is the default state and serializes back to nothing", () => {
    expect(parseUsersQuery({})).toEqual(USERS_QUERY_DEFAULTS);
    expect(serializeUsersQuery(USERS_QUERY_DEFAULTS)).toBe("");
    expect(usersListUrl()).toBe("/admin/users");
  });

  test("every supported parameter round-trips through the canonical order", () => {
    const query = {
      q: "ada lovelace",
      role: "moderator",
      verified: "no",
      status: "banned",
      sort: "email",
      direction: "asc",
      page: 3,
      pageSize: 50,
    };
    const serialized = serializeUsersQuery(query);
    expect(serialized).toBe(
      "?q=ada+lovelace&role=moderator&verified=no&status=banned&sort=email&direction=asc&page=3&pageSize=50",
    );
    const raw = Object.fromEntries(new URLSearchParams(serialized).entries());
    expect(parseUsersQuery(raw)).toEqual(query);
    expect(usersQuerySchema.safeParse(parseUsersQuery(raw)).success).toBe(true);
  });

  test("unsupported enum values, malformed numbers and unknown keys fall back to defaults", () => {
    expect(
      parseUsersQuery({
        role: "superuser",
        verified: "maybe",
        status: "deleted",
        sort: "password",
        direction: "sideways",
        page: "-1",
        pageSize: "33",
        limit: "999",
        __proto__: "x",
      }),
    ).toEqual(USERS_QUERY_DEFAULTS);
    expect(parseUsersQuery({ page: "0" }).page).toBe(1);
    expect(parseUsersQuery({ page: "1e3" }).page).toBe(1);
    expect(parseUsersQuery({ page: "1000001" }).page).toBe(1);
    expect(parseUsersQuery({ page: "1000000" }).page).toBe(1_000_000);
    expect(parseUsersQuery({ page: "007" }).page).toBe(7);
  });

  test("a repeated supported key resolves to its default, never first or last", () => {
    expect(parseUsersQuery({ role: ["admin", "user"] }).role).toBe("all");
    expect(parseUsersQuery({ q: ["a", "b"] }).q).toBe("");
    expect(parseUsersQuery({ page: ["2", "3"] }).page).toBe(1);
  });

  test("search text is trimmed and truncated to 200 characters; encoded IDs survive", () => {
    expect(parseUsersQuery({ q: "  padded  " }).q).toBe("padded");
    expect(parseUsersQuery({ q: "x".repeat(300) }).q).toHaveLength(200);
    const id = "abc/def?ghi&jkl=mno";
    const raw = Object.fromEntries(new URLSearchParams(serializeUsersQuery({ ...USERS_QUERY_DEFAULTS, q: id })));
    expect(parseUsersQuery(raw).q).toBe(id);
  });

  test("the strict operation schema refuses what URL normalization tolerates", () => {
    expect(usersQuerySchema.safeParse({ ...USERS_QUERY_DEFAULTS, role: "superuser" }).success).toBe(false);
    expect(usersQuerySchema.safeParse({ ...USERS_QUERY_DEFAULTS, page: 0 }).success).toBe(false);
    expect(usersQuerySchema.safeParse({ ...USERS_QUERY_DEFAULTS, pageSize: 33 }).success).toBe(false);
    expect(usersQuerySchema.safeParse({ ...USERS_QUERY_DEFAULTS, extra: 1 }).success).toBe(false);
    expect(usersQuerySchema.safeParse({ ...USERS_QUERY_DEFAULTS, q: "x".repeat(201) }).success).toBe(false);
  });
});

describe("state changes", () => {
  const filtered = { ...USERS_QUERY_DEFAULTS, q: "ada", role: "admin", sort: "name", direction: "asc", page: 4, pageSize: 10 };

  test("filter, sort and page-size changes reset the page and keep everything else", () => {
    expect(withUsersQueryChange(filtered, { status: "banned" })).toEqual({ ...filtered, status: "banned", page: 1 });
    expect(withUsersQueryChange(filtered, { pageSize: 100 })).toEqual({ ...filtered, pageSize: 100, page: 1 });
  });

  test("clear filters keeps sort and page size only", () => {
    expect(clearUsersFilters(filtered)).toEqual({
      ...USERS_QUERY_DEFAULTS,
      sort: "name",
      direction: "asc",
      pageSize: 10,
    });
    expect(hasUsersFilters(filtered)).toBe(true);
    expect(hasUsersFilters(clearUsersFilters(filtered))).toBe(false);
  });

  test("page clamping folds onto the last page and to 1 for an empty result", () => {
    expect(clampUsersPage({ ...USERS_QUERY_DEFAULTS, page: 9, pageSize: 25 }, 60).page).toBe(3);
    expect(clampUsersPage({ ...USERS_QUERY_DEFAULTS, page: 2, pageSize: 25 }, 60).page).toBe(2);
    expect(clampUsersPage({ ...USERS_QUERY_DEFAULTS, page: 5 }, 0).page).toBe(1);
    const same = { ...USERS_QUERY_DEFAULTS, page: 1 };
    expect(clampUsersPage(same, 0)).toBe(same);
  });
});

describe("return navigation", () => {
  test("a relative list URL whose query survives the codec is accepted canonically", () => {
    expect(resolveReturnTo("/admin/users")).toBe("/admin/users");
    expect(resolveReturnTo("/admin/users?role=admin&page=2")).toBe("/admin/users?role=admin&page=2");
    expect(resolveReturnTo("/admin/users?page=2&role=admin&bogus=1&sort=password")).toBe(
      "/admin/users?role=admin&page=2",
    );
    expect(resolveReturnTo("/admin/users?page=1")).toBe("/admin/users");
  });

  test("external, protocol-relative, wrong-path, fragment and malformed values fall back", () => {
    for (const value of [
      "https://evil.example/admin/users",
      "//evil.example/admin/users",
      "/\\evil.example",
      "/admin/users#frag",
      "/admin/users/abc",
      "/admin",
      "/admin/users?q=x#x",
      "admin/users",
      "javascript:alert(1)",
      "",
      undefined,
      ["/admin/users", "/admin/users"],
      "/admin/users?" + "q=" + "x".repeat(3000),
    ])
      expect(resolveReturnTo(value)).toBe("/admin/users");
  });

  test("detail links carry the current list state only when it is not the default", () => {
    expect(userDetailUrl("/admin/users/u1", USERS_QUERY_DEFAULTS)).toBe("/admin/users/u1");
    expect(userDetailUrl("/admin/users/u1", { ...USERS_QUERY_DEFAULTS, q: "a b", page: 2 })).toBe(
      "/admin/users/u1?returnTo=%2Fadmin%2Fusers%3Fq%3Da%2Bb%26page%3D2",
    );
    const url = new URL(userDetailUrl("/admin/users/u1", { ...USERS_QUERY_DEFAULTS, q: "a b", page: 2 }), "http://x");
    expect(resolveReturnTo(url.searchParams.get("returnTo"))).toBe("/admin/users?q=a+b&page=2");
  });
});
