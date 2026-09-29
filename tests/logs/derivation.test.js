import { expect, test } from "bun:test";
import {
  actorFromContext,
  canonicalJson,
  clipText,
  deriveEmailSearchText,
  sha256Hex,
  UNNAMED_USER_LABEL,
} from "../../app/(LogsModule)/_/derivation";
import { createRedactor, REDACTED } from "../../app/(LogsModule)/_/redaction";

/** Server-derived values of an email record: the requester, the search document and the idempotency form. */

test("clipping caps the length, marks the cut and leaves shorter text alone", () => {
  expect(clipText("short", 500)).toBe("short");
  expect(clipText("a".repeat(500), 500)).toBe("a".repeat(500));
  const long = clipText("word ".repeat(400), 500);
  expect(long.length).toBe(500);
  expect(long.endsWith("…")).toBe(true);
});

test("clipping never splits a surrogate pair", () => {
  const clipped = clipText("a".repeat(498) + "😀😀", 500);
  expect(clipped.length).toBeLessThanOrEqual(500);
  expect(clipped.toWellFormed()).toBe(clipped);
});

test("the email search document holds the subject and the recipient only", () => {
  expect(deriveEmailSearchText({ subject: "Hello", recipientEmail: "a@example.test", recipientLabel: null })).toBe(
    "Hello\na@example.test",
  );
  expect(deriveEmailSearchText({ subject: "Hello", recipientEmail: "a@example.test", recipientLabel: "Alice" })).toBe(
    "Hello\na@example.test\nAlice",
  );
});

test("canonical JSON sorts keys recursively, keeps array order and drops undefined", async () => {
  const a = canonicalJson({ b: [3, { z: 1, a: 2 }], a: new Date("2026-09-27T10:00:00Z"), c: undefined });
  const b = canonicalJson({ a: new Date("2026-09-27T10:00:00.000Z"), b: [3, { a: 2, z: 1 }] });
  expect(a).toBe(b);
  expect(a).toBe('{"a":"2026-09-27T10:00:00.000Z","b":[3,{"a":2,"z":1}]}');
  expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  expect(() => canonicalJson({ n: Number.NaN })).toThrow();
  expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("the actor comes from the context alone: user ID and redacted name, or Anonymous", () => {
  const redactor = createRedactor({ code: "123456" });
  expect(actorFromContext({ user: null }, redactor)).toEqual({ kind: "anonymous", label: "Anonymous" });
  expect(actorFromContext({ user: { id: "u-1", name: "  Ada\nLovelace " } }, redactor)).toEqual({
    kind: "user",
    id: "u-1",
    label: "Ada Lovelace",
  });
  expect(actorFromContext({ user: { id: "u-2", name: "Code 123456" } }, redactor).label).toBe(`Code ${REDACTED}`);
  expect(actorFromContext({ user: { id: "u-3", name: "   " } }, redactor)).toEqual({
    kind: "user",
    id: "u-3",
    label: UNNAMED_USER_LABEL,
  });
  expect(actorFromContext({ user: { id: "u-4", name: "n".repeat(300) } }, redactor).label).toHaveLength(200);
});
