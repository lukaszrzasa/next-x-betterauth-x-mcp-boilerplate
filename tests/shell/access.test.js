import { expect, test } from "bun:test";
import { authorize, isRouteActive } from "../../src/lib/access/routes";
import { appRoutes } from "../../src/lib/app/routes";
import { authRoutes } from "../../app/(AuthModule)/_/routes";
import { logsRoutes } from "../../app/(LogsModule)/_/routes";
import { can } from "../../src/lib/auth/permissions";

const viewer = (role) => ({ role });

test("public and session access", () => {
  expect(authorize(null, "public")).toBe(true);
  expect(authorize(null, "session")).toBe(false);
  expect(authorize(viewer("user"), "session")).toBe(true);
  expect(authorize(viewer(null), "session")).toBe(true);
});

test("roles admit any listed role; perm and roles combine with AND", () => {
  expect(authorize(viewer("moderator"), { roles: ["admin", "moderator"] })).toBe(true);
  expect(authorize(viewer("user"), { roles: ["admin", "moderator"] })).toBe(false);
  expect(authorize(null, { roles: ["admin"] })).toBe(false);
  expect(authorize(viewer("admin"), { perm: "user.list" })).toBe(true);
  expect(authorize(viewer("moderator"), { roles: ["admin"], perm: "user.list" })).toBe(false);
  expect(authorize(viewer("moderator"), { perm: ["user.list", "user.delete"] })).toBe(false);
  expect(authorize(viewer("moderator"), { perm: ["user.list", "user.delete"], connector: "OR" })).toBe(true);
});

test("a permission grant does not admit a role outside the declared role list", () => {
  expect(can("user", "user.list")).toBe(false);
  expect(authorize(viewer("user"), authRoutes.adminUsers.access)).toBe(false);
  expect(authorize(viewer("user"), appRoutes.dashboard.access)).toBe(false);
});

test("declared dashboard pages: moderator reaches Dashboard and Users, not System", () => {
  expect(authorize(viewer("moderator"), appRoutes.dashboard.access)).toBe(true);
  expect(authorize(viewer("moderator"), authRoutes.adminUsers.access)).toBe(true);
  expect(authorize(viewer("moderator"), logsRoutes.staffLogs.access)).toBe(false);
  expect(authorize(viewer("moderator"), logsRoutes.emailLogs.access)).toBe(false);
  expect(authorize(viewer("admin"), logsRoutes.staffLogs.access)).toBe(true);
});

test("comma-separated roles are honoured", () => {
  expect(authorize(viewer("user,moderator"), authRoutes.adminUsers.access)).toBe(true);
  expect(authorize(viewer("user,moderator"), logsRoutes.staffLogs.access)).toBe(false);
  expect(authorize(viewer("moderator,admin"), logsRoutes.staffLogs.access)).toBe(true);
  expect(authorize(viewer(" user , guest "), appRoutes.dashboard.access)).toBe(false);
});

test("Dashboard matches exactly; section routes match slash-delimited descendants", () => {
  expect(isRouteActive(appRoutes.dashboard, "/admin")).toBe(true);
  expect(isRouteActive(appRoutes.dashboard, "/admin/")).toBe(true);
  expect(isRouteActive(appRoutes.dashboard, "/admin/users")).toBe(false);
  expect(isRouteActive(authRoutes.adminUsers, "/admin/users")).toBe(true);
  expect(isRouteActive(authRoutes.adminUsers, "/admin/users/42")).toBe(true);
  expect(isRouteActive(authRoutes.adminUsers, "/admin/users-other")).toBe(false);
  expect(isRouteActive(authRoutes.adminUsers, "/admin")).toBe(false);
});
