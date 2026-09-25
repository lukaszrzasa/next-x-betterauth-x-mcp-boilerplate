import { expect, test } from "bun:test";
import { navigation, visibleNavigation } from "../../app/_/navigation";

const hrefs = (viewer) =>
  visibleNavigation(viewer).map((group) => [group.label, group.items.map((item) => item.href)]);

test("admin receives both groups; moderator receives General only", () => {
  expect(hrefs({ role: "admin" })).toEqual([
    ["General", ["/admin", "/admin/users"]],
    ["System", ["/admin/audit-logs", "/admin/email-logs"]],
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
