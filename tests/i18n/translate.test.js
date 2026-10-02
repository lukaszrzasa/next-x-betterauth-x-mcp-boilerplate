import { expect, mock, test } from "bun:test";
import { z } from "zod";

mock.module("server-only", () => ({}));

const { translateKey, translateDescriptor, translateIssue } = await import("../../src/lib/i18n/translate");
const { localizeActionError } = await import("../../src/lib/auth/builders/adapters/localize");
const { ActionError } = await import("../../src/lib/auth/errors");
const { zodErrorMap } = await import("../../src/lib/i18n/zod");
const { localizedZodResolver } = await import("../../src/lib/forms/localizedResolver");
const { formatUtcDate, formatUtcDateTime } = await import("../../src/lib/date/format");
const { formatTimeLeft } = await import("../../src/lib/date/duration");
const { translatorFor } = await import("../../src/lib/app/messages");

test("a key renders in the requested locale; an unknown key renders nothing", () => {
  expect(translateKey("en", "errors.auth.invalidCode")).toBe("That verification code is not valid.");
  expect(translateKey("pl", "errors.auth.invalidCode")).toBe("Ten kod weryfikacyjny jest nieprawidłowy.");
  expect(translateKey("pl", "errors.auth.emailCodeCooldown", { seconds: 30 })).toContain("30 sekund");
  expect(translateKey("en", "no.such.key")).toBeNull();
  expect(translateKey("en", "Plain prose, not a key.")).toBeNull();
});

test("a refusal shows its descriptor, or the generic sentence for its reason", () => {
  const described = new ActionError("CONFLICT", { message: { key: "errors.auth.securityStateChanged" }, data: { x: 1 } });
  expect(described.descriptor).toEqual({ key: "errors.auth.securityStateChanged" });
  expect(described.message).toBe("errors.auth.securityStateChanged");
  expect(localizeActionError(described, "en")).toMatch(/security settings changed/);
  expect(localizeActionError(described, "pl")).toMatch(/Ustawienia bezpieczeństwa/);

  const bare = new ActionError("NOT_FOUND");
  expect(bare.descriptor).toBeNull();
  expect(localizeActionError(bare, "pl")).toBe("To już nie istnieje.");

  const developer = new ActionError("FORBIDDEN", { message: "Missing permission (AND): user.list" });
  expect(developer.message).toBe("Missing permission (AND): user.list");
  expect(localizeActionError(developer, "en")).toBe("You are not allowed to do this.");
  expect(translateDescriptor("en", { key: "errors.auth.emailCodeCooldown", values: { seconds: 5 } })).toBe(
    "Wait 5 seconds before requesting another email code.",
  );
});

test("validation issues: Zod's own messages through its locale pack, custom messages through the catalog", async () => {
  const schema = z.object({ email: z.email(), name: z.string().min(2, "errors.auth.notFound") });
  const result = await schema.safeParseAsync({ email: "nope", name: "x" }, { error: zodErrorMap("pl") });
  expect(result.success).toBe(false);
  const [email, name] = result.error.issues;
  expect(translateIssue("pl", email)).toMatch(/Nieprawidłow/);
  expect(translateIssue("pl", name)).toBe("Nie znaleziono.");
  expect(translateIssue("en", { message: "Plain prose stays." })).toBe("Plain prose stays.");
});

test("the form resolver reports the same translated issues as the server, bounds included", async () => {
  const t = translatorFor("pl");
  const seen = [];
  const schema = z.object({ name: z.string().min(2, "errors.auth.notFound"), count: z.number() });
  const resolver = localizedZodResolver(schema, "pl", (key, values) => {
    seen.push([key, values]);
    return t.has(key) ? t(key, values) : null;
  });
  const result = await resolver({ name: "x", count: "many" }, undefined, { fields: {}, shouldUseNativeValidation: false });
  expect(result.errors.name.message).toBe("Nie znaleziono.");
  expect(result.errors.name.type).toBe("too_small");
  expect(result.errors.count.message).toMatch(/Nieprawidłowe dane/);
  expect(seen).toContainEqual(["errors.auth.notFound", { minimum: 2 }]);
  const valid = await resolver({ name: "Ada", count: 1 }, undefined, { fields: {}, shouldUseNativeValidation: false });
  expect(valid.errors).toEqual({});
  expect(valid.values).toEqual({ name: "Ada", count: 1 });
});

test("instants render in the locale, always in UTC with the zone named", () => {
  const instant = "2026-09-25T14:32:00.000Z";
  expect(formatUtcDate(instant, "en")).toBe("Sep 25, 2026");
  expect(formatUtcDate(instant, "pl")).toBe("25 wrz 2026");
  expect(formatUtcDateTime(instant, "en")).toMatch(/^Sep 25, 2026.*02:32 PM UTC$/);
  expect(formatUtcDateTime(instant, "pl")).toMatch(/^25 wrz 2026.*14:32 UTC$/);
  expect(formatUtcDateTime("garbage", "en", "Unknown")).toBe("Unknown");
  expect(formatUtcDate(new Date(NaN), "pl")).toBe("");
});

test("time left is a message with values, rendered by the caller's translator", () => {
  const en = translatorFor("en");
  const pl = translatorFor("pl");
  const render = (locale) => (seconds) => formatTimeLeft(seconds, (key, values) => locale(`common.timeLeft.${key}`, values));
  expect(render(en)(3 * 3600 + 12 * 60 + 5)).toBe("3h 12m left");
  expect(render(en)(12 * 60 + 40)).toBe("12m left");
  expect(render(en)(40)).toBe("40s left");
  expect(render(en)(0)).toBe("expired");
  expect(render(pl)(40)).toBe("pozostało 40 s");
});

test("Polish plurals take all four forms", () => {
  const t = translatorFor("pl");
  expect(t("common.pagination.rows", { total: 1 })).toBe("1 wiersz");
  expect(t("common.pagination.rows", { total: 3 })).toBe("3 wiersze");
  expect(t("common.pagination.rows", { total: 12 })).toBe("12 wierszy");
  expect(t("common.pagination.rows", { total: 22 })).toBe("22 wiersze");
  expect(t("common.pagination.rows", { total: 0 })).toBe("Brak wierszy");
});
