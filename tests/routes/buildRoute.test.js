import { expect, test } from "bun:test";
import { buildRoute, withQuery } from "../../src/lib/routes";

test("fills segments, catch-alls and query strings with encoding", () => {
  expect(buildRoute("/users/[id]", { id: 42 })).toBe("/users/42");
  expect(buildRoute("/users/[id]/posts/[post]", { id: "a b", post: "x/y" })).toBe(
    "/users/a%20b/posts/x%2Fy",
  );
  expect(buildRoute("/docs/[...slug]", { slug: ["guide", "set up"] })).toBe("/docs/guide/set%20up");
  expect(buildRoute("/auth/reset-password", undefined, { token: "t&k", error: undefined })).toBe(
    "/auth/reset-password?token=t%26k",
  );
  expect(buildRoute("/panel")).toBe("/panel");
});

test("missing parameters fail loudly instead of producing a broken path", () => {
  expect(() => buildRoute("/users/[id]", {})).toThrow('missing parameter "id"');
});

test("withQuery skips empty values and leaves the path untouched without any", () => {
  expect(withQuery("/a", { b: null, c: undefined })).toBe("/a");
  expect(withQuery("/a", { b: 1, c: false })).toBe("/a?b=1&c=false");
});
