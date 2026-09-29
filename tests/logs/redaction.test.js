import { describe, expect, test } from "bun:test";
import {
  REDACTED,
  REDACTED_LINK,
  TRUNCATION_MARKER,
  assertNoStructuralSecrets,
  collectDeniedKeySecrets,
  createRedactor,
  isDeniedKey,
  serializeErrorForLog,
  truncateDiagnostic,
  truncateDiagnosticChars,
} from "../../app/(LogsModule)/_/redaction";
import { LogRecordingError } from "../../app/(LogsModule)/_/types";
import { truncateUtf8, utf8ByteLength } from "../../src/lib/text/utf8";
import { DrizzleQueryError } from "drizzle-orm/errors";

/**
 * The content policy (redaction version 1) on its own: declared secrets and
 * their encoded forms, link stripping, denied keys, structural rejection and
 * the byte-bounded truncation that runs after redaction.
 */

describe("declared secrets", () => {
  test("a code in a subject and a body, and a URL in a button and its fallback text", () => {
    const code = "482913";
    const url = "https://app.example.test/auth/verify?token=tok_9f8e7d6c&next=%2Fpanel";
    const redactor = createRedactor({ verificationCode: code, confirmUrl: url });
    expect(redactor.text(`${code} is your verification code`)).toBe(`${REDACTED} is your verification code`);
    expect(redactor.text(`Your code is ${code}.\nConfirm: ${url}\nOr paste ${url} into your browser.`)).toBe(
      `Your code is ${REDACTED}.\nConfirm: ${REDACTED}\nOr paste ${REDACTED} into your browser.`,
    );
  });

  test("URI-encoded and HTML-escaped variants are removed too", () => {
    const token = "a&b<c>'d\"e f";
    const redactor = createRedactor({ token });
    const variants = [
      token,
      encodeURIComponent(token),
      "a&amp;b&lt;c&gt;&#39;d&quot;e f",
      "a&amp;b&lt;c&gt;&#x27;d&quot;e f",
    ];
    for (const variant of variants) expect(redactor.text(`[${variant}]`)).toBe(`[${REDACTED}]`);
    // An href attribute holds the escaped form of the encoded URL.
    const href = encodeURIComponent(token).replaceAll("&", "&amp;");
    expect(redactor.text(`href="${href}"`)).toBe(`href="${REDACTED}"`);
  });

  test("overlapping and nested secrets leave no fragment behind", () => {
    const redactor = createRedactor({ first: "abcd", second: "cdef", nested: ["bc"] });
    expect(redactor.text("xxabcdefyy")).toBe(`xx${REDACTED}yy`);
    expect(redactor.text("abcd and cdef and bc")).toBe(`${REDACTED} and ${REDACTED} and ${REDACTED}`);
    // Adjacent occurrences collapse into one marker.
    expect(createRedactor({ s: "ab" }).text("ababab!")).toBe(`${REDACTED}!`);
  });

  test("secrets are matched literally: regular-expression metacharacters mean nothing", () => {
    const secret = "a.*b(c)|[d]$^\\";
    const redactor = createRedactor({ secret });
    expect(redactor.text(`x${secret}y`)).toBe(`x${REDACTED}y`);
    expect(redactor.text("aXXXb(c)|[d]$^\\ stays")).toBe("aXXXb(c)|[d]$^\\ stays");
  });

  test("six-digit numbers are not blanked by pattern; only declared values are", () => {
    const redactor = createRedactor({});
    expect(redactor.text("Order 123456 shipped on 2026-09-27 to user 654321")).toBe(
      "Order 123456 shipped on 2026-09-27 to user 654321",
    );
  });

  test("empty values are ignored; too many or too large values are rejected, not dropped", () => {
    expect(createRedactor({ empty: "", list: ["", "x1"] }).text("x1 y")).toBe(`${REDACTED} y`);
    const many = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`s${index}`, `secret-${index}`]));
    expect(() => createRedactor(many)).toThrow(LogRecordingError);
    expect(() => createRedactor({ big: "x".repeat(8 * 1024 + 1) })).toThrow(LogRecordingError);
    const error = (() => {
      try {
        createRedactor({ big: "SENSITIVE".repeat(2000) });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error.code).toBe("INVALID_RECORD");
    expect(JSON.stringify(error.issues) + error.message).not.toContain("SENSITIVE");
    expect(error.cause).toBeUndefined();
  });

  test("secrets are normalized like the text, so a lone surrogate or NUL cannot shield one", () => {
    const redactor = createRedactor({ secret: "ab\uD800cd", other: "x\u0000y" });
    expect(redactor.text("1 ab\uD800cd 2 x\u0000y 3")).toBe(`1 ${REDACTED} 2 ${REDACTED} 3`);
    expect(redactor.containsSecret("id-ab\uD800cd")).toBe(true);
  });
});

describe("links", () => {
  test("http(s) and mailto URLs are removed even when undeclared; prose punctuation stays", () => {
    const redactor = createRedactor({});
    expect(redactor.text("See https://example.test/a?b=c.")).toBe(`See ${REDACTED_LINK}.`);
    expect(redactor.text("(details: http://example.test/x)")).toBe(`(details: ${REDACTED_LINK})`);
    expect(redactor.text("Wiki https://en.example.test/Foo_(bar) here")).toBe(`Wiki ${REDACTED_LINK} here`);
    expect(redactor.text("Write to mailto:help@example.test, please")).toBe(`Write to ${REDACTED_LINK}, please`);
    expect(redactor.text("HTTPS://EXAMPLE.TEST/UPPER!")).toBe(`${REDACTED_LINK}!`);
    expect(redactor.text('<a href="https://x.test/y">go</a>')).toBe(`<a href="${REDACTED_LINK}">go</a>`);
    expect(redactor.text("ftp://x.test and www.example.test stay")).toBe("ftp://x.test and www.example.test stay");
  });

  test("an apostrophe inside a URL is part of it; a trailing one is prose", () => {
    const redactor = createRedactor({});
    expect(redactor.text("see https://a.test/r?name=O'Brien&sig=S3CR3T more")).toBe(`see ${REDACTED_LINK} more`);
    expect(redactor.text("href='https://a.test/x'")).toBe(`href='${REDACTED_LINK}'`);
    expect(redactor.text("('https://a.test/x').")).toBe(`('${REDACTED_LINK}').`);
  });

  test("a URL whose token was already redacted is removed as a whole", () => {
    const redactor = createRedactor({ token: "tok_123" });
    expect(redactor.text("Open https://x.test/confirm?token=tok_123 now")).toBe(`Open ${REDACTED_LINK} now`);
  });
});

describe("structured values", () => {
  test("denied keys are compared case-insensitively without separators; exact names only", () => {
    for (const key of ["password", "NEW_PASSWORD", "new-password", "newPassword", "Access.Token", "OTP", "code", "recovery_codes", "Authorization", "cookie", "sessionToken", "backupCodes", "secret", "refresh token", "authenticator_code", "recoveryCode"]) {
      expect(isDeniedKey(key)).toBe(true);
    }
    for (const key of ["errorCode", "zipCode", "name", "email", "tokens", "passwordHint"]) {
      expect(isDeniedKey(key)).toBe(false);
    }
  });

  test("a denied key loses its value whatever the type; other strings are redacted as text", () => {
    const redactor = createRedactor({ code: "777111" });
    expect(redactor.scalar("password", "hunter2")).toBe(REDACTED);
    expect(redactor.scalar("otp", 123456)).toBe(REDACTED);
    expect(redactor.scalar("token", null)).toBe(REDACTED);
    expect(redactor.scalar("token", false)).toBe(REDACTED);
    expect(redactor.scalar("reason", "code 777111 at https://x.test")).toBe(`code ${REDACTED} at ${REDACTED_LINK}`);
    expect(redactor.scalar("count", 3)).toBe(3);
    // A declared code passed as a number is still the code.
    expect(redactor.scalar("attempted", 777111)).toBe(REDACTED);
    expect(redactor.scalar("attempted", 97771110)).toBe(REDACTED);
    expect(redactor.scalar("attempted", 777112)).toBe(777112);
    expect(redactor.scalar("enabled", true)).toBe(true);
    expect(redactor.scalar("note", null)).toBeNull();
  });

  test("a declared secret in a structural field rejects the record, naming only the path", () => {
    const redactor = createRedactor({ resetToken: "rt_ABCDEF" });
    expect(() => assertNoStructuralSecrets(redactor, [["recordKey", "ok"], ["subject.id", null]])).not.toThrow();
    let caught;
    try {
      assertNoStructuralSecrets(redactor, [["recordKey", "key-rt_ABCDEF"], ["subject.id", "fine"]]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LogRecordingError);
    expect(caught.issues).toEqual([{ path: "recordKey", code: "sensitive_value" }]);
    expect(caught.message + JSON.stringify(caught.issues)).not.toContain("rt_ABCDEF");
    expect(createRedactor({ t: "a b" }).containsSecret("x%20ya%20b")).toBe(true);
  });

  test("NUL and lone surrogates become U+FFFD so PostgreSQL text and jsonb accept the value", () => {
    const redactor = createRedactor({});
    expect(redactor.text("a\u0000b\uD800c")).toBe("a�b�c");
  });
});

describe("bounds", () => {
  test("UTF-8 byte length and truncation never split a code point", () => {
    expect(utf8ByteLength("aé€😀")).toBe(1 + 2 + 3 + 4);
    expect(utf8ByteLength("\uD800")).toBe(3);
    expect(truncateUtf8("ab😀c", 5)).toBe("ab");
    expect(truncateUtf8("ab😀c", 6)).toBe("ab😀");
    expect(truncateUtf8("éé", 3)).toBe("é");
    expect(truncateUtf8("abc", 10)).toBe("abc");
  });

  test("diagnostics are cut after redaction to their byte budget, marker included", () => {
    const text = "😀".repeat(20_000);
    const cut = truncateDiagnostic(text, 32 * 1024);
    expect(utf8ByteLength(cut)).toBeLessThanOrEqual(32 * 1024);
    expect(cut.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(cut.slice(0, -TRUNCATION_MARKER.length).toWellFormed()).toBe(cut.slice(0, -TRUNCATION_MARKER.length));
    expect(truncateDiagnostic("short", 100)).toBe("short");
    const chars = truncateDiagnosticChars("x".repeat(3_999) + "😀" + "y".repeat(10), 4_000);
    expect(chars.length).toBeLessThanOrEqual(4_000);
    expect(chars.endsWith(TRUNCATION_MARKER)).toBe(true);
  });

  test("a token that straddles the cut is redacted first, so no fragment survives", () => {
    const token = "tok_" + "z".repeat(40);
    const redactor = createRedactor({ token });
    const stack = "x".repeat(32 * 1024 - 20) + token + "tail";
    const stored = truncateDiagnostic(redactor.text(stack), 32 * 1024);
    expect(stored).not.toContain("tok_");
    expect(stored).not.toContain("zzzzzzzz");
  });
});

describe("serializeErrorForLog", () => {
  test("reads only name, message and stack along the cause chain, redacted", () => {
    const provider = new Error("Request to https://api.provider.test failed for 553311 is your code");
    provider.name = "ProviderError";
    provider.requestBody = { html: "<p>553311</p>", apiKey: "re_live_SECRET" };
    provider.headers = { authorization: "Bearer re_live_SECRET" };
    const wrapper = new Error("send failed", { cause: provider });
    const result = serializeErrorForLog(wrapper, { code: "553311" });
    expect(result.errorMessage).toBe(
      `Error: send failed\nCaused by: ProviderError: Request to ${REDACTED_LINK} failed for ${REDACTED} is your code`,
    );
    expect(result.stackTrace).toContain("Caused by:");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("553311");
    expect(serialized).not.toContain("re_live_SECRET");
    expect(serialized).not.toContain("api.provider.test");
  });

  test("a query error keeps its statement but never its bound parameters, in message or stack", () => {
    const hash = "9f2c:5b1e0d7a";
    const query = new DrizzleQueryError('insert into "account" ("password") values ($1)', [hash, "user@example.com"], new Error("test failure"));
    const result = serializeErrorForLog(new Error("create failed", { cause: query }), {});
    expect(result.errorMessage).toContain('Failed query: insert into "account" ("password") values ($1)\nparams: [omitted]');
    expect(result.errorMessage).toContain("Caused by: Error: test failure");
    expect(result.stackTrace).toContain("params: [omitted]");
    for (const value of [hash, "user@example.com"]) expect(JSON.stringify(result)).not.toContain(value);

    // A stack that does not start with the message it would rewrite is dropped, not kept.
    const odd = new DrizzleQueryError("select $1", ["secret-value"]);
    odd.stack = `prefix ${odd.stack}`;
    const oddResult = serializeErrorForLog(odd, {});
    expect(oddResult.stackTrace).toBeUndefined();
    expect(JSON.stringify(oddResult)).not.toContain("secret-value");
  });

  test("cycles and depth are bounded; an oversized part is omitted rather than cut", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b;
    expect(serializeErrorForLog(a, {}).errorMessage).toBe("Error: a\nCaused by: Error: b");
    const huge = new Error("x".repeat(20_000));
    expect(serializeErrorForLog(huge, {}).errorMessage).toBe("Error: [omitted: too large]");
    expect(serializeErrorForLog("plain string", {}).errorMessage).toBe("plain string");
    expect(serializeErrorForLog({ message: "not an Error" }, {})).toEqual({ errorMessage: undefined, stackTrace: undefined });
  });
});

describe("collectDeniedKeySecrets", () => {
  test("every string under a denied key, at any depth, as one declared secret list", () => {
    expect(
      collectDeniedKeySecrets({
        userId: "u1",
        currentPassword: "old-password",
        nested: { new_password: "new-password", items: [{ code: "123456" }, { code: 42 }] },
        recoveryCodes: ["aaaa-bbbb", "cccc-dddd"],
        token: "",
      }),
    ).toEqual({ deniedKeys: ["old-password", "new-password", "123456", "aaaa-bbbb", "cccc-dddd"] });
    expect(collectDeniedKeySecrets({ name: "Ada" })).toEqual({});
    expect(collectDeniedKeySecrets(null)).toEqual({});
    expect(collectDeniedKeySecrets("password")).toEqual({});
  });

  test("bounded: oversized values are skipped and the count is capped, so recording cannot fail on them", () => {
    const many = Object.fromEntries(Array.from({ length: 150 }, (_, index) => [`k${index}`, { token: `t-${index}` }]));
    expect(collectDeniedKeySecrets(many).deniedKeys).toHaveLength(100);
    expect(collectDeniedKeySecrets({ password: "x".repeat(9 * 1024) })).toEqual({});
  });
});
