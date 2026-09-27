import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

/**
 * The settings operations through the real builder pipeline with the
 * provider session, Redis and the services mocked: entry points, MCP
 * exclusion, self-only inputs, the verification matrix of section 5
 * (verified/enrolled combinations), impersonation, enrollment gating and
 * the public proof operations' independence from any session. The services
 * themselves are covered by the integration suite.
 */

const base = {
  id: "user-1",
  name: "Ada",
  email: "ada@example.com",
  emailVerified: true,
  role: "user",
  twoFactorRequired: false,
  twoFactorEnabled: false,
  securityVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const session = { id: "session-1", userId: base.id, token: "token", impersonatedBy: null };
let resolved;
let stored;
const getSession = mock(async () => resolved);
const verifyTOTP = mock(async () => ({ token: session.token, user: base }));
const requestHeaders = new Headers({ cookie: "session=real", "user-agent": "test" });
const redis = {
  get: mock(async (key) => stored.get(key) ?? null),
  set: mock(async (key, value, ...options) => {
    if (options.includes("NX") && stored.has(key)) return null;
    stored.set(key, value);
    return "OK";
  }),
  del: mock(async (...keys) => keys.reduce((count, key) => count + Number(stored.delete(key)), 0)),
  ttl: mock(async () => -2),
  eval: mock(async () => 0),
};
const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => (resolved ? [{ ...resolved.user, sessionRevocationPending: false }] : []),
      }),
    }),
  }),
};
const called = mock((name, ctx, input) => ({ name, userId: ctx.user?.id ?? null, input }));
const service = (name, output) => mock(async (ctx, input) => { called(name, ctx, input); return output; });
const sync = { status: "completed" };
const services = {
  profile: {
    readProfileSettings: service("readProfileSettings", { name: "Ada" }),
    updateDisplayName: service("updateDisplayName", sync),
    retryProfileSessionRefresh: service("retryProfileSessionRefresh", sync),
    readAccountSettings: service("readAccountSettings", { email: "ada@example.com" }),
  },
  password: {
    changeOwnPassword: service("changeOwnPassword", sync),
    completePasswordReset: service("completePasswordReset", { status: "completed" }),
  },
  email: {
    beginEmailChange: service("beginEmailChange", { status: "pending" }),
    beginEmailCorrection: service("beginEmailCorrection", { status: "pending" }),
    selectNewEmailAddress: service("selectNewEmailAddress", { status: "pending" }),
    resendEmailRequest: service("resendEmailRequest", { status: "pending" }),
    resendOwnVerification: service("resendOwnVerification", sync),
    cancelEmailRequest: service("cancelEmailRequest", sync),
    inspectEmailProof: service("inspectEmailProof", { status: "inactive" }),
    confirmEmailProof: service("confirmEmailProof", { status: "inactive" }),
  },
  factor: {
    beginEnrollment: service("beginEnrollment", { status: "pending" }),
    confirmEnrollment: service("confirmEnrollment", { status: "completed" }),
    beginReplacement: service("beginReplacement", { status: "pending" }),
    confirmReplacement: service("confirmReplacement", { status: "completed" }),
    cancelSetup: service("cancelSetup", sync),
    disableAuthenticator: service("disableAuthenticator", sync),
    retryFactorSessionRefresh: service("retryFactorSessionRefresh", sync),
    regenerateRecoveryCodes: service("regenerateRecoveryCodes", { status: "completed" }),
  },
  sessions: {
    listOwnSessions: service("listOwnSessions", { items: [], page: 1, pageSize: 20, total: 0 }),
    revokeOwnSession: service("revokeOwnSession", sync),
    revokeOtherOwnSessions: service("revokeOtherOwnSessions", sync),
    revokeAllOwnSessions: service("revokeAllOwnSessions", sync),
  },
};

mock.module("server-only", () => ({}));
mock.module("../../src/lib/db/index.ts", () => ({ db: fakeDb, user: {}, emailChangeRequest: {} }));
mock.module("../../src/lib/auth/index.ts", () => ({ auth: { api: { getSession, verifyTOTP } } }));
mock.module("../../src/lib/redis/index.ts", () => ({ redis, incrementWithTtl: async () => 1, decrementIfExists: async () => 0 }));
mock.module("../../src/lib/email/index.tsx", () => ({ sendTwoFactorOtpEmail: async () => {} }));
mock.module("next/headers", () => ({ headers: async () => requestHeaders }));
// One module per service function: each is replaced by its stub, under the folder of its group.
const serviceFolders = { profile: "profile", password: "password", email: "emailChange", factor: "twoFactor", sessions: "sessions" };
for (const [group, folder] of Object.entries(serviceFolders)) {
  for (const [name, stub] of Object.entries(services[group])) {
    mock.module(`../../app/(AuthModule)/_/db/settings/${folder}/${name}.ts`, () => ({ [name]: stub }));
  }
}

const profile = await import("../../app/(AuthModule)/_/operations/settings/profile.ts");
const account = await import("../../app/(AuthModule)/_/operations/settings/account.ts");
const password = await import("../../app/(AuthModule)/_/operations/settings/password.ts");
const emailChange = await import("../../app/(AuthModule)/_/operations/settings/emailChange.ts");
const emailCorrection = await import("../../app/(AuthModule)/_/operations/settings/emailCorrection.ts");
const emailProof = await import("../../app/(AuthModule)/_/operations/settings/emailProof.ts");
const authenticator = await import("../../app/(AuthModule)/_/operations/settings/authenticator.ts");
const recoveryCodes = await import("../../app/(AuthModule)/_/operations/settings/recoveryCodes.ts");
const sessions = await import("../../app/(AuthModule)/_/operations/settings/sessions.ts");
const { completePasswordResetOperation } = await import("../../app/(AuthModule)/_/operations/passwordReset.ts");
const queries = await import("../../app/(AuthModule)/_/queries.ts");

const meta = { entryPoint: "server-action", headers: requestHeaders };
const as = (overrides = {}) => {
  resolved = { user: { ...base, ...overrides }, session: { ...session } };
};
const denied = (promise, reason) => expect(promise).rejects.toMatchObject({ reason });
const grant = (version = 0) => stored.set(`stepup:grant:${base.id}:${session.id}`, JSON.stringify({ verifiedAt: Date.now(), securityVersion: version }));

const authenticated = {
  getProfile: [profile.getProfileOperation, undefined],
  getAccount: [account.getAccountOperation, undefined],
  updateName: [profile.updateDisplayNameOperation, { name: "Ada Lovelace" }],
  retryProfile: [profile.retryProfileSessionRefreshOperation, undefined],
  resendVerification: [emailChange.resendVerificationOperation, undefined],
  beginChange: [emailChange.beginEmailChangeOperation, { currentPassword: "pw" }],
  beginCorrection: [emailCorrection.beginEmailCorrectionOperation, { currentPassword: "pw", newEmail: "new@example.com" }],
  selectNew: [emailChange.selectNewEmailOperation, { requestId: "r1", newEmail: "new@example.com" }],
  resend: [emailChange.resendEmailRequestOperation, { requestId: "r1" }],
  cancel: [emailChange.cancelEmailRequestOperation, { requestId: "r1" }],
  changePassword: [password.changePasswordOperation, { currentPassword: "pw", newPassword: "new-password-1", revokeOtherSessions: true }],
  beginEnrollment: [authenticator.beginEnrollmentOperation, { currentPassword: "pw" }],
  confirmEnrollment: [authenticator.confirmEnrollmentOperation, { requestId: "s1", code: "123456" }],
  beginReplacement: [authenticator.beginReplacementOperation, { currentPassword: "pw" }],
  confirmReplacement: [authenticator.confirmReplacementOperation, { requestId: "s1", code: "123456" }],
  cancelSetup: [authenticator.cancelSetupOperation, { requestId: "s1" }],
  disable: [authenticator.disableAuthenticatorOperation, { currentPassword: "pw" }],
  retryFactor: [authenticator.retryFactorSessionRefreshOperation, undefined],
  regenerate: [recoveryCodes.regenerateRecoveryCodesOperation, { currentPassword: "pw" }],
  listSessions: [sessions.listSessionsOperation, { page: 1 }],
  revokeOne: [sessions.revokeSessionOperation, { sessionId: "s-2" }],
  revokeOthers: [sessions.revokeOtherSessionsOperation, undefined],
  revokeAll: [sessions.revokeAllSessionsOperation, undefined],
};
const publicOps = {
  inspect: [emailProof.inspectEmailProofOperation, { token: "A".repeat(43) }],
  confirm: [emailProof.confirmEmailProofOperation, { token: "A".repeat(43) }],
  reset: [completePasswordResetOperation, { token: "reset-token", newPassword: "new-password-1" }],
};

/** Section 5.3: which operations need a verified address, and which an enrolled account's step-up. */
const VERIFIED_ONLY = ["beginChange", "changePassword", "beginEnrollment", "confirmEnrollment", "beginReplacement", "confirmReplacement", "disable", "regenerate"];
const ENROLLED_STEP_UP = ["beginChange", "changePassword", "beginReplacement", "confirmReplacement", "disable", "regenerate"];

beforeEach(() => {
  stored = new Map();
  as();
  called.mockClear();
  for (const fn of [getSession, verifyTOTP, ...Object.values(redis)]) fn.mockClear();
  for (const level of ["log", "warn", "error"]) spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => mock.restore());

describe("entry points and MCP", () => {
  test("no settings operation is MCP-eligible; MCP and unknown provenance are refused before any service runs", async () => {
    for (const [operation, input] of [...Object.values(authenticated), ...Object.values(publicOps)]) {
      expect(operation.mcpAllowed).toBe(false);
      for (const entryPoint of ["mcp", "unknown", undefined]) {
        await denied(operation(input, { ...meta, entryPoint }), "FORBIDDEN");
      }
    }
    expect(called).not.toHaveBeenCalled();
  });

  test("the SSR queries run the full pipeline through the server-render entry point", async () => {
    expect(await queries.getProfileQuery(undefined)).toEqual({ name: "Ada" });
    expect(await queries.listSessionsQuery({ page: 1 })).toMatchObject({ pageSize: 20 });
    expect(await queries.inspectEmailProofQuery({ token: "A".repeat(43) })).toEqual({ status: "inactive" });
    resolved = null;
    await denied(queries.getAccountQuery(undefined), "UNAUTHENTICATED");
  });
});

describe("identity", () => {
  test("guests are refused by every authenticated operation before any service runs", async () => {
    resolved = null;
    for (const [operation, input] of Object.values(authenticated)) await denied(operation(input, meta), "UNAUTHENTICATED");
    expect(called).not.toHaveBeenCalled();
  });

  test("every authenticated operation acts on ctx.user.id; a user, request or session ID for another account is not accepted as input", async () => {
    await denied(profile.updateDisplayNameOperation({ name: "X", userId: "user-2" }, meta), "INVALID_INPUT");
    // No-input operations discard whatever the caller sends; the handler sees undefined.
    await sessions.revokeOtherSessionsOperation({ userId: "user-2" }, meta);
    expect(called).toHaveBeenLastCalledWith("revokeOtherOwnSessions", expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }), undefined);
    await profile.updateDisplayNameOperation({ name: "X" }, meta);
    expect(called).toHaveBeenLastCalledWith("updateDisplayName", expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }), { name: "X" });
    // A session ID is validated as opaque text, never as a UUID, and resolved among the actor's own sessions by the service.
    await sessions.revokeSessionOperation({ sessionId: "provider-session-id" }, meta);
    expect(called).toHaveBeenLastCalledWith("revokeOwnSession", expect.anything(), { sessionId: "provider-session-id" });
  });

  test("required-but-unenrolled accounts are kept out of every authenticated settings operation, but a public proof still works", async () => {
    as({ role: "moderator", twoFactorEnabled: false });
    for (const [operation, input] of Object.values(authenticated)) await denied(operation(input, meta), "TWO_FACTOR_ENROLLMENT_REQUIRED");
    expect(called).not.toHaveBeenCalled();
    expect(await emailProof.confirmEmailProofOperation({ token: "A".repeat(43) }, meta)).toEqual({ status: "inactive" });
  });

  test("public proof operations never resolve or use the browser's session", async () => {
    for (const [operation, input] of Object.values(publicOps)) {
      await operation(input, meta);
      expect(getSession).not.toHaveBeenCalled();
      const [, ctx] = called.mock.calls.at(-1);
      expect(ctx.user).toBeNull();
      expect(ctx.session).toBeNull();
    }
  });

  test("impersonated sessions cannot run the sensitive self-service operations", async () => {
    as({ twoFactorEnabled: true });
    resolved.session.impersonatedBy = "admin-1";
    for (const key of ENROLLED_STEP_UP) {
      const [operation, input] = authenticated[key];
      await denied(operation(input, meta), "IMPERSONATION_FORBIDDEN");
    }
  });
});

describe("verification matrix", () => {
  test("verified, not enrolled: password/factor/change need no step-up; nothing prompts", async () => {
    for (const [key, [operation, input]] of Object.entries(authenticated)) {
      const output = await operation(input, meta);
      expect(output).toBeTruthy();
      const [, ctx] = called.mock.calls.at(-1);
      expect(ctx.stepUp).toBeNull();
      expect(key).toBeDefined();
    }
    expect(verifyTOTP).not.toHaveBeenCalled();
  });

  test("verified, enrolled: the sensitive operations require the five-minute step-up, satisfied by a grant of the current generation", async () => {
    as({ twoFactorEnabled: true, securityVersion: 4 });
    for (const key of ENROLLED_STEP_UP) {
      const [operation, input] = authenticated[key];
      await denied(operation(input, meta), "TWO_FACTOR_REQUIRED");
    }
    expect(called).not.toHaveBeenCalled();
    grant(3);
    await denied(authenticated.changePassword[0](authenticated.changePassword[1], meta), "TWO_FACTOR_REQUIRED");
    grant(4);
    for (const key of ENROLLED_STEP_UP) {
      const [operation, input] = authenticated[key];
      await operation(input, meta);
      const [, ctx] = called.mock.calls.at(-1);
      expect(ctx.stepUp).toBe("five_minutes");
    }
    // The rest never prompts.
    for (const key of Object.keys(authenticated).filter((entry) => !ENROLLED_STEP_UP.includes(entry))) {
      const [operation, input] = authenticated[key];
      stored.clear();
      await operation(input, meta);
    }
  });

  test("unverified, not enrolled: reads, name, sessions, verification resend and the correction work; the rest need a verified address", async () => {
    as({ emailVerified: false });
    for (const [key, [operation, input]] of Object.entries(authenticated)) {
      if (VERIFIED_ONLY.includes(key)) await denied(operation(input, meta), "EMAIL_VERIFICATION_REQUIRED");
      else await operation(input, meta);
    }
  });

  test("unverified, enrolled: the correction is admitted without the shared step-up; the sensitive operations still need a verified address", async () => {
    as({ emailVerified: false, twoFactorEnabled: true });
    await authenticated.beginCorrection[0]({ ...authenticated.beginCorrection[1], authenticatorCode: "123456" }, meta);
    expect(called).toHaveBeenLastCalledWith("beginEmailCorrection", expect.anything(), expect.objectContaining({ authenticatorCode: "123456" }));
    expect(verifyTOTP).not.toHaveBeenCalled(); // the service, not the pipeline, checks the code
    for (const key of VERIFIED_ONLY) await denied(authenticated[key][0](authenticated[key][1], meta), "EMAIL_VERIFICATION_REQUIRED");
  });

  test("a stale proof for an account that is no longer enrolled is refused, not converted into a grant", async () => {
    await denied(authenticated.changePassword[0](authenticated.changePassword[1], { ...meta, stepUp: { method: "totp", code: "123456" } }), "INVALID_INPUT");
    expect(verifyTOTP).not.toHaveBeenCalled();
    expect([...stored.keys()].some((key) => key.startsWith("stepup:grant"))).toBe(false);
  });

  test("root follows the same rules as any staff account: enrolled, verified, step-up for the sensitive operations", async () => {
    as({ role: "admin", twoFactorRequired: true, twoFactorEnabled: true });
    await denied(authenticated.beginChange[0](authenticated.beginChange[1], meta), "TWO_FACTOR_REQUIRED");
    grant();
    await authenticated.beginChange[0](authenticated.beginChange[1], meta);
    await authenticated.updateName[0](authenticated.updateName[1], meta);
    expect(called).toHaveBeenCalledTimes(2);
  });
});

describe("input", () => {
  test("strict schemas: unknown keys, malformed tokens, invalid codes, unchanged passwords, out-of-range pages", async () => {
    await denied(profile.updateDisplayNameOperation({ name: "" }, meta), "INVALID_INPUT");
    await denied(profile.updateDisplayNameOperation({ name: "bad\u0007name" }, meta), "INVALID_INPUT");
    await denied(password.changePasswordOperation({ currentPassword: "same-password-1", newPassword: "same-password-1", revokeOtherSessions: false }, meta), "INVALID_INPUT");
    await denied(password.changePasswordOperation({ currentPassword: "pw", newPassword: "short", revokeOtherSessions: false }, meta), "INVALID_INPUT");
    await denied(password.changePasswordOperation({ currentPassword: "pw", newPassword: "new-password-1", revokeOtherSessions: "yes" }, meta), "INVALID_INPUT");
    await denied(password.changePasswordOperation({ currentPassword: "pw", newPassword: "new-password-1", revokeOtherSessions: true, confirmNewPassword: "x" }, meta), "INVALID_INPUT");
    await denied(emailProof.confirmEmailProofOperation({ token: "A".repeat(42) }, meta), "INVALID_INPUT");
    await denied(emailProof.confirmEmailProofOperation({ token: "A".repeat(43), userId: "u" }, meta), "INVALID_INPUT");
    await denied(emailProof.confirmEmailProofOperation({ token: `${"A".repeat(42)}!` }, meta), "INVALID_INPUT");
    await denied(authenticator.confirmEnrollmentOperation({ requestId: "s1", code: "12345" }, meta), "INVALID_INPUT");
    await denied(emailCorrection.beginEmailCorrectionOperation({ currentPassword: "pw", newEmail: "not-an-email" }, meta), "INVALID_INPUT");
    await denied(emailCorrection.beginEmailCorrectionOperation({ currentPassword: "pw", newEmail: "x@example.com", authenticatorCode: "abc" }, meta), "INVALID_INPUT");
    await denied(sessions.listSessionsOperation({ page: 0 }, meta), "INVALID_INPUT");
    await denied(sessions.listSessionsOperation({ page: 1.5 }, meta), "INVALID_INPUT");
    expect(called).not.toHaveBeenCalled();
    // Normalization: the address is trimmed and lowercased; the password is never trimmed.
    await emailCorrection.beginEmailCorrectionOperation({ currentPassword: " pw ", newEmail: "  New@Example.com " }, meta);
    expect(called).toHaveBeenLastCalledWith("beginEmailCorrection", expect.anything(), { currentPassword: " pw ", newEmail: "new@example.com", authenticatorCode: undefined });
  });
});
