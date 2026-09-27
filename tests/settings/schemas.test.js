import { expect, test } from "bun:test";
import {
  beginEmailCorrectionSchema,
  changePasswordFormSchema,
  changePasswordSchema,
  confirmationTokenSchema,
  opaqueIdSchema,
  sessionPageSchema,
  updateDisplayNameSchema,
} from "../../app/(AuthModule)/_/schemas/settings";
import { emailSchema, nameSchema } from "../../app/(AuthModule)/_/schema";

/** The field rules of section 6, on the shared primitives and the settings contracts. */

const ok = (schema, value) => schema.safeParse(value).success;

test("display name: trimmed, 1-100 characters, international text, no control characters", () => {
  expect(updateDisplayNameSchema.parse({ name: "  Zoë Ünal 李 " })).toEqual({ name: "Zoë Ünal 李" });
  expect(ok(nameSchema, "")).toBe(false);
  expect(ok(nameSchema, "   ")).toBe(false);
  expect(ok(nameSchema, "a".repeat(101))).toBe(false);
  expect(ok(nameSchema, "a".repeat(100))).toBe(true);
  expect(ok(nameSchema, "bad\u0000name")).toBe(false);
  expect(ok(nameSchema, "tab\there")).toBe(false);
});

test("email: trimmed, lowercased, valid, at most 254 characters", () => {
  expect(emailSchema.parse("  Ada@Example.COM ")).toBe("ada@example.com");
  expect(ok(emailSchema, "not-an-email")).toBe(false);
  expect(ok(emailSchema, `${"a".repeat(250)}@x.io`)).toBe(false);
});

test("passwords: never trimmed, 8-128 for a new one, non-empty for the current one, distinct from each other", () => {
  expect(changePasswordSchema.parse({ currentPassword: " old ", newPassword: " new-password ", revokeOtherSessions: true })).toEqual({
    currentPassword: " old ",
    newPassword: " new-password ",
    revokeOtherSessions: true,
  });
  expect(ok(changePasswordSchema, { currentPassword: "", newPassword: "new-password-1", revokeOtherSessions: true })).toBe(false);
  expect(ok(changePasswordSchema, { currentPassword: "old", newPassword: "1234567", revokeOtherSessions: true })).toBe(false);
  expect(ok(changePasswordSchema, { currentPassword: "old", newPassword: "x".repeat(129), revokeOtherSessions: true })).toBe(false);
  expect(ok(changePasswordSchema, { currentPassword: "same-password-1", newPassword: "same-password-1", revokeOtherSessions: true })).toBe(false);
  // The form carries the confirmation and defaults the checkbox on; the operation schema rejects both.
  const form = changePasswordFormSchema.parse({ currentPassword: "old", newPassword: "new-password-1", confirmNewPassword: "new-password-1" });
  expect(form.revokeOtherSessions).toBe(true);
  expect(ok(changePasswordFormSchema, { currentPassword: "old", newPassword: "new-password-1", confirmNewPassword: "other" })).toBe(false);
  expect(ok(changePasswordSchema, { ...form })).toBe(false);
});

test("correction: the authenticator code is optional and six digits when present", () => {
  expect(beginEmailCorrectionSchema.parse({ currentPassword: "pw", newEmail: "a@b.co" })).toEqual({ currentPassword: "pw", newEmail: "a@b.co", authenticatorCode: undefined });
  expect(beginEmailCorrectionSchema.parse({ currentPassword: "pw", newEmail: "a@b.co", authenticatorCode: " 123456 " }).authenticatorCode).toBe("123456");
  expect(ok(beginEmailCorrectionSchema, { currentPassword: "pw", newEmail: "a@b.co", authenticatorCode: "12345" })).toBe(false);
});

test("tokens and identifiers: canonical base64url token, opaque IDs without path characters, bounded page numbers", () => {
  expect(ok(confirmationTokenSchema, "A-_".repeat(14) + "A")).toBe(true);
  expect(ok(confirmationTokenSchema, "A".repeat(42))).toBe(false);
  expect(ok(confirmationTokenSchema, "A".repeat(44))).toBe(false);
  expect(ok(confirmationTokenSchema, `${"A".repeat(42)}=`)).toBe(false);
  expect(ok(opaqueIdSchema, "provider-session-id")).toBe(true);
  expect(ok(opaqueIdSchema, "")).toBe(false);
  expect(ok(opaqueIdSchema, "a/b")).toBe(false);
  expect(ok(opaqueIdSchema, "x".repeat(129))).toBe(false);
  expect(ok(sessionPageSchema, 1)).toBe(true);
  expect(ok(sessionPageSchema, 0)).toBe(false);
  expect(ok(sessionPageSchema, 1_000_001)).toBe(false);
  expect(ok(sessionPageSchema, "2")).toBe(false);
});
