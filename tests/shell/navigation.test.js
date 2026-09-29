import { expect, test } from "bun:test";
import { navigation, visibleNavigation } from "../../src/lib/app/navigation";
import { authRoutes } from "../../app/(AuthModule)/_/routes";
import { logsRoutes } from "../../app/(LogsModule)/_/routes";
import { appRoutes } from "../../src/lib/app/routes";

const hrefs = (viewer) =>
  visibleNavigation(viewer).map((group) => [group.label, group.items.map((item) => item.href)]);

test("admin receives both groups; moderator receives General only", () => {
  expect(hrefs({ role: "admin" })).toEqual([
    ["General", ["/admin", "/admin/users"]],
    ["System", ["/admin/staff-logs", "/admin/email-logs"]],
  ]);
  expect(hrefs({ role: "moderator" })).toEqual([["General", ["/admin", "/admin/users"]]]);
});

test("ordinary users and guests receive nothing", () => {
  expect(hrefs({ role: "user" })).toEqual([]);
  expect(hrefs(null)).toEqual([]);
});

test("account settings are absent from shell navigation", () => {
  const all = navigation.flatMap((group) => group.items.map((item) => item.href));
  expect(all.some((href) => href.startsWith("/settings"))).toBe(false);
});

test("navigation items are serializable declarations with icon identifiers", () => {
  for (const group of navigation) {
    for (const item of group.items) {
      expect(typeof item.icon).toBe("string");
      expect(JSON.parse(JSON.stringify(item))).toEqual(item);
    }
  }
});

test("the System category lists the logs module's pages; categories do not follow module names", () => {
  const system = navigation.find((group) => group.label === "System");
  expect(system.items).toEqual([logsRoutes.staffLogs, logsRoutes.emailLogs]);
  expect(navigation.some((group) => group.label === "Logs")).toBe(false);
});

test("every declared path is owned by exactly one route table", () => {
  const hrefs = [appRoutes, authRoutes, logsRoutes].flatMap((table) =>
    Object.values(table).map((route) => route.href),
  );
  expect(new Set(hrefs).size).toBe(hrefs.length);
});
