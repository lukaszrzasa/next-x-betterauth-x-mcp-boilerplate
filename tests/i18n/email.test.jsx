import { expect, mock, test } from "bun:test";
import { render } from "@react-email/components";

mock.module("server-only", () => ({}));

let operationLocale = null;
mock.module("../../src/lib/auth/builders/context/index.ts", () => ({
  currentOperationContext: () => (operationLocale ? { locale: operationLocale } : null),
}));

const React = await import("react");
const { emailLocale, emailTranslator } = await import("../../src/lib/email/i18n");
const { default: TwoFactorOtp } = await import("../../src/lib/email/templates/TwoFactorOtp");
const { default: EmailChangeConfirmation } = await import("../../src/lib/email/templates/EmailChangeConfirmation");

/**
 * Emails are written in the language of whoever asked for them and say so
 * in their markup; the log then keeps the subject and text as sent.
 */

test("the message's language: the operation's, else the provider request's, else the default", () => {
  expect(emailLocale()).toBe("en");
  expect(emailLocale(new Headers({ "accept-language": "pl" }))).toBe("pl");
  expect(emailLocale(new Headers({ "x-locale": "pl" }))).toBe("pl");
  operationLocale = "pl";
  try {
    expect(emailLocale(new Headers({ "accept-language": "en" }))).toBe("pl");
  } finally {
    operationLocale = null;
  }
});

test("subjects and bodies come from the email catalog in both languages", async () => {
  const en = emailTranslator("en");
  const pl = emailTranslator("pl");
  expect(en("otp.subject", { code: "482913" })).toBe("482913 is your verification code");
  expect(pl("otp.subject", { code: "482913" })).toBe("482913 to Twój kod weryfikacyjny");

  const english = await render(<TwoFactorOtp code="482913" expiresInMinutes={1} name="Ada" locale="en" t={en} />);
  expect(english).toContain('lang="en"');
  expect(english).toContain("Hi Ada, enter this code to finish signing in to Boilerplate. It expires in 1 minute.");
  expect(english).toContain("482913");

  const polish = await render(<TwoFactorOtp code="482913" expiresInMinutes={5} locale="pl" t={pl} />);
  expect(polish).toContain('lang="pl"');
  expect(polish).toContain("Wygasa za 5 minut.");
  expect(polish).not.toContain("Cześć");
});

test("the email-change deadline is formatted in the message's locale, in UTC", async () => {
  const expiresAt = new Date("2026-09-25T14:32:00.000Z");
  const html = await render(
    <EmailChangeConfirmation url="https://example.test/confirm" purpose="new" expiresAt={expiresAt} locale="pl" t={emailTranslator("pl")} />,
  );
  expect(html).toContain("Ten link działa do 25 wrz 2026");
  expect(html).toContain("14:32 UTC");
  expect(html).toContain("Potwierdź adres e-mail");
});
