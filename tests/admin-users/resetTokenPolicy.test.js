import { expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const { isResetTokenSuperseded, resetTokenIdentifier, RESET_PASSWORD_PATH } =
  await import("../../src/lib/auth/resetTokenPolicy");

const cutoff = new Date("2026-09-25T12:00:00.000Z");

test("without a cutoff every token passes, whatever its timestamp looks like", () => {
  expect(isResetTokenSuperseded({ createdAt: undefined }, null)).toBe(false);
  expect(isResetTokenSuperseded({ createdAt: "garbage" }, undefined)).toBe(false);
  expect(isResetTokenSuperseded({ createdAt: new Date(0) }, "not a date")).toBe(false);
});

test("with a cutoff, tokens at or before it are refused and later ones pass", () => {
  expect(isResetTokenSuperseded({ createdAt: new Date("2026-09-25T11:59:59.999Z") }, cutoff)).toBe(true);
  expect(isResetTokenSuperseded({ createdAt: "2026-09-25T12:00:00.000Z" }, cutoff.toISOString())).toBe(true);
  expect(isResetTokenSuperseded({ createdAt: new Date("2026-09-25T12:00:00.001Z") }, cutoff)).toBe(false);
});

test("with a cutoff, a missing or unreadable creation time fails closed", () => {
  expect(isResetTokenSuperseded({}, cutoff)).toBe(true);
  expect(isResetTokenSuperseded({ createdAt: "yesterday" }, cutoff)).toBe(true);
  expect(isResetTokenSuperseded({ createdAt: NaN }, cutoff)).toBe(true);
});

test("the identifier and path match the installed endpoint", () => {
  expect(resetTokenIdentifier("abc")).toBe("reset-password:abc");
  expect(RESET_PASSWORD_PATH).toBe("/reset-password");
});
