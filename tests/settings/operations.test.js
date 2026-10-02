import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { APIError } from "better-auth/api";

/**
 * The settings operations, real from the builder pipeline down to their
 * last decision. What is replaced is what lies below them: the persistence
 * modules (`_/db/**`), the provider (`auth.api`, its internal adapter),
 * Redis and the mailer. So these tests cover the gates (entry points, MCP
 * exclusion, self-only inputs, the verification matrix, impersonation,
 * enrollment) and the orchestration each handler owns: guard order, what is
 * charged and when, which seam is or is not reached, and truthful outcomes.
 * SQL predicates and provider behaviour are the integration suite's.
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
const REQUEST_ID = "0198f3a2-7c1e-7b6a-9d55-0e2a4c6f8b10";
const SETUP_ID = "0198f3a2-7c1e-7b6a-9d55-0e2a4c6f8b11";
const TOKEN = "A".repeat(43);
const requestHeaders = new Headers({ cookie: "session=real", "user-agent": "test" });

let resolved;
let stored;
let counters;
/** Every call that reached a seam below the operations, in order. */
const touched = [];
/** What the seams answer with; reset before each test. */
let world;

const names = () => touched.map((entry) => entry.name);
const callsTo = (name) => touched.filter((entry) => entry.name === name);
const lastCtx = () => touched.findLast((entry) => entry.ctx)?.ctx;

const lock = { holders: [], held: 0, beforeWork: null };

/** A persistence function: records the call (and whether the security lock was held), then answers from `world`. */
const seam = (name, answer) =>
  mock(async (ctx, ...args) => {
    touched.push({ name, ctx, args, locked: lock.held > 0 });
    return answer(ctx, ...args);
  });

/** A provider or adapter call: no context of ours reaches it. */
const external = (name, answer) =>
  mock(async (...args) => {
    touched.push({ name, args, locked: lock.held > 0 });
    return answer(...args);
  });

/** A refusal the way the provider raises it: its own API error, with a machine-readable code. */
const providerError = (code) => new APIError("BAD_REQUEST", { code, message: code });

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const getSession = mock(async () => resolved);
const verifyTOTP = mock(async () => ({ token: session.token, user: base }));
const redis = {
  get: mock(async (key) => stored.get(key) ?? null),
  set: mock(async (key, value, ...options) => {
    if (options.includes("NX") && stored.has(key)) return null;
    stored.set(key, value);
    return "OK";
  }),
  del: mock(async (...keys) => keys.reduce((count, key) => count + Number(stored.delete(key) || counters.delete(key)), 0)),
  ttl: mock(async (key) => (stored.has(key) || counters.has(key) ? 60 : -2)),
  eval: mock(async () => 0),
};
const incrementWithTtl = async (key) => {
  counters.set(key, (counters.get(key) ?? 0) + 1);
  return counters.get(key);
};
const decrementIfExists = async (key) => {
  if (!counters.has(key)) return 0;
  counters.set(key, counters.get(key) - 1);
  return counters.get(key);
};
/** The session authority and the security version read the current user row. */
const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => (resolved ? [{ ...resolved.user, sessionRevocationPending: false }] : []),
      }),
    }),
  }),
  /** The revocation barrier's version-conditional clear (`sessionAuthority`). */
  transaction: async (work) =>
    work({
      execute: async (statement) => {
        touched.push({ name: "barrier.clear", args: [statement] });
        return { rowCount: 1 };
      },
      update: () => ({ set: () => ({ where: async () => {} }) }),
    }),
};

const provider = {
  updateUser: external("auth.api.updateUser", () => world.provider.updateUser()),
  verifyPassword: external("auth.api.verifyPassword", ({ body }) => world.provider.verifyPassword(body.password)),
  changePassword: external("auth.api.changePassword", () => world.provider.changePassword()),
  resetPassword: external("auth.api.resetPassword", () => world.provider.resetPassword()),
  revokeSession: external("auth.api.revokeSession", () => ({})),
  sendVerificationEmail: external("auth.api.sendVerificationEmail", () => ({})),
  enableTwoFactor: external("auth.api.enableTwoFactor", () => {
    world.factor = { id: "factor-1", userId: base.id, secret: "encrypted-pending", verified: false, backupCodes: "codes" };
    return { totpURI: "otpauth://totp/App:ada?secret=MANUALKEY" };
  }),
  disableTwoFactor: external("auth.api.disableTwoFactor", () => world.provider.disableTwoFactor()),
  generateBackupCodes: external("auth.api.generateBackupCodes", () => ({ backupCodes: ["aaaaa-bbbbb"] })),
};
const adapter = {
  listSessions: external("adapter.listSessions", (userId) => world.sessions.filter((entry) => entry.userId === userId)),
  deleteSessions: external("adapter.deleteSessions", (tokens) => world.deleteSessions(tokens)),
  deleteUserSessions: external("adapter.deleteUserSessions", (userId) => world.deleteUserSessions(userId)),
  findSessions: external("adapter.findSessions", (tokens) =>
    world.sessions.filter((entry) => tokens.includes(entry.token)).map((entry) => ({ session: entry })),
  ),
  findUserById: external("adapter.findUserById", () => resolved?.user ?? null),
  refreshUserSessions: external("adapter.refreshUserSessions", () => world.provider.refreshUserSessions()),
  findCredentialAccount: external("adapter.findCredentialAccount", () => ({ password: world.storedPasswordHash })),
  findVerificationValue: external("adapter.findVerificationValue", () => world.resetToken),
};
const sendEmailChangeConfirmationEmail = external("mail.emailChange", (message) => world.mail(message));

mock.module("server-only", () => ({}));
mock.module("../../src/lib/db/index.ts", () => ({ db: fakeDb, user: {}, emailChangeRequest: {} }));
mock.module("../../src/lib/auth/index.ts", () => ({
  auth: {
    api: { getSession, verifyTOTP, ...provider },
    $context: Promise.resolve({
      baseURL: "http://localhost:3000",
      internalAdapter: adapter,
      password: { verify: async ({ hash, password }) => hash === `hash:${password}` },
    }),
  },
}));
mock.module("../../src/lib/redis/index.ts", () => ({ redis, incrementWithTtl, decrementIfExists }));
mock.module("../../src/lib/email/index.tsx", () => ({ sendTwoFactorOtpEmail: async () => {}, sendEmailChangeConfirmationEmail }));
mock.module("next/headers", () => ({ headers: async () => requestHeaders }));
mock.module("../../src/lib/auth/factorCodec.ts", () => ({
  fingerprintEncryptedSecret: (secret) => `fp:${secret}`,
  manualKeyFromUri: (uri) => new URL(uri).searchParams.get("secret"),
  generateFactorSecret: () => "new-secret",
  encryptFactorSecret: async (secret) => `encrypted:${secret}`,
  decryptFactorSecret: async (encrypted) => encrypted.replace("encrypted:", ""),
  totpUriFor: (secret) => `otpauth://totp/App:ada?secret=${secret}`,
  verifyFactorCode: async (secret, code) => code === world.validCode,
  generateRecoveryCodes: () => ["ccccc-ddddd"],
  encryptRecoveryCodes: async (codes) => JSON.stringify(codes),
  decryptRecoveryCodes: async () => ["eeeee-fffff"],
}));

// ---------------------------------------------------------------------------
// Persistence seams
// ---------------------------------------------------------------------------

const DB = "../../app/(AuthModule)/_/db";
mock.module(`${DB}/security/accountLock.ts`, () => ({
  withAccountSecurityLock: async (ctx, userId, work) => {
    lock.holders.push(userId);
    await lock.beforeWork?.();
    lock.held += 1;
    try {
      return await work();
    } finally {
      lock.held -= 1;
    }
  },
  closeAccountSecurityLockPool: async () => {},
}));
mock.module(`${DB}/security/retirement.ts`, () => ({
  retirePendingSecurityState: seam("retirePendingSecurityState", () => 1),
  retirePendingSetups: seam("retirePendingSetups", () => 1),
  advanceSecurityVersion: seam("advanceSecurityVersion", () => 1),
}));
mock.module(`${DB}/security/resetCutoff.ts`, () => ({
  findResetCutoff: seam("findResetCutoff", () => world.resetCutoff),
}));
mock.module(`${DB}/profile/profileReads.ts`, () => ({
  findProfile: seam("findProfile", () => world.profile),
  findAccount: seam("findAccount", (ctx) => ({
    id: ctx.user.id,
    email: ctx.user.email,
    emailVerified: ctx.user.emailVerified,
    role: ctx.user.role,
    twoFactorRequired: ctx.user.twoFactorRequired,
    twoFactorEnabled: ctx.user.twoFactorEnabled,
  })),
}));
mock.module(`${DB}/emailRequests/owner.ts`, () => ({
  findEmailOwner: seam("findEmailOwner", (ctx) => world.owner ?? { id: ctx.user.id, email: ctx.user.email, emailVerified: ctx.user.emailVerified }),
  isAddressTaken: seam("isAddressTaken", (ctx, email) => world.takenAddresses.includes(email)),
}));
mock.module(`${DB}/emailRequests/requests.ts`, () => ({
  ACTIVE_STATES: ["awaiting_current", "awaiting_new_address", "awaiting_new"],
  findActiveRequest: seam("findActiveRequest", () => world.request),
  findOwnedRequest: seam("findOwnedRequest", (ctx, id) => (world.request?.id === id ? world.request : null)),
  findRequestByTokenHash: seam("findRequestByTokenHash", () => world.request),
  replaceActiveRequest: seam("replaceActiveRequest", (ctx, values) => {
    world.request = { ...requestRow(), ...values, id: REQUEST_ID };
    return world.request;
  }),
}));
mock.module(`${DB}/emailRequests/transitions.ts`, () => ({
  markExpired: seam("markExpired", () => {}),
  expireIfOverdue: seam("expireIfOverdue", () => world.overdue),
  markCancelled: seam("markCancelled", () => true),
  cancelOwnedRequest: seam("cancelOwnedRequest", () => world.cancels),
  selectNewAddress: seam("selectNewAddress", (ctx, selection) =>
    world.conditionalWriteMatches
      ? { ...world.request, state: "awaiting_new", newEmail: selection.newEmail, newTokenHash: selection.newTokenHash }
      : null,
  ),
  rotateToken: seam("rotateToken", (ctx, rotation) =>
    world.conditionalWriteMatches ? { ...world.request, currentTokenHash: rotation.tokenHash } : null,
  ),
  confirmCurrentAddress: seam("confirmCurrentAddress", () => world.conditionalWriteMatches),
}));
mock.module(`${DB}/emailRequests/finalization.ts`, () => ({
  finalizeEmailChange: seam("finalizeEmailChange", async (ctx, target, decide) => {
    if (world.finalizationConflict) return { conflict: true };
    return { conflict: false, result: await decide(world.locked) };
  }),
}));
mock.module(`${DB}/authenticator/factors.ts`, () => ({
  findFactor: seam("findFactor", () => world.factor),
  findFactorAccount: seam("findFactorAccount", (ctx) => ({
    id: ctx.user.id,
    email: ctx.user.email,
    role: ctx.user.role,
    twoFactorRequired: ctx.user.twoFactorRequired,
    twoFactorEnabled: world.factorEnabled ?? ctx.user.twoFactorEnabled === true,
  })),
  deleteUnverifiedFactor: seam("deleteUnverifiedFactor", () => {}),
}));
mock.module(`${DB}/authenticator/setupRequests.ts`, () => ({
  cancelPendingSetups: seam("cancelPendingSetups", () => 0),
  cancelSetupRequest: seam("cancelSetupRequest", () => world.cancels),
  insertSetup: seam("insertSetup", (ctx, values) => world.insertSetup({ ...setupRow(), ...values })),
  findOwnedSetup: seam("findOwnedSetup", (ctx, id) => (world.setup?.id === id ? world.setup : null)),
  markSetupExpired: seam("markSetupExpired", () => {}),
  markSetupCompleted: seam("markSetupCompleted", () => {}),
}));
mock.module(`${DB}/authenticator/factorSwap.ts`, () => ({
  swapFactor: seam("swapFactor", () => world.conditionalWriteMatches),
}));

const { loadSettingsOperations } = await import("../helpers/authOperations.js");
const { profile, account, password, emailChange, emailCorrection, emailProof, authenticator, recoveryCodes, sessions } =
  await loadSettingsOperations();
const { completePasswordResetOperation } = await import("../../app/(AuthModule)/_/operations/passwordReset.ts");
const queries = await import("../../app/(AuthModule)/_/queries.ts");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
function requestRow(overrides = {}) {
  return {
    id: REQUEST_ID,
    userId: base.id,
    kind: "change",
    state: "awaiting_current",
    originalEmail: base.email,
    newEmail: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * HOUR),
    currentConfirmedAt: null,
    currentTokenHash: "current-hash",
    newTokenHash: null,
    currentTokenGeneration: 1,
    newTokenGeneration: 0,
    ...overrides,
  };
}
function setupRow(overrides = {}) {
  return {
    id: SETUP_ID,
    userId: base.id,
    initiatingSessionId: session.id,
    kind: "enroll",
    state: "pending",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 600_000),
    currentFactorId: "factor-1",
    currentFactorFingerprint: "fp:encrypted-pending",
    authorizedSecurityVersion: 0,
    replacementSecret: null,
    ...overrides,
  };
}
const verifiedFactor = { id: "factor-1", userId: base.id, secret: "encrypted-active", verified: true, backupCodes: "codes" };
const ownSession = (id, token, createdAt) => ({
  id,
  token,
  userId: base.id,
  createdAt: new Date(createdAt),
  expiresAt: new Date(Date.now() + HOUR),
  ipAddress: "203.0.113.5",
  userAgent: "test",
});

function freshWorld() {
  return {
    profile: { name: "Ada" },
    owner: null,
    takenAddresses: ["taken@example.com"],
    request: requestRow(),
    overdue: false,
    cancels: true,
    conditionalWriteMatches: true,
    finalizationConflict: false,
    locked: null,
    factor: null,
    factorEnabled: null,
    setup: setupRow(),
    insertSetup: (row) => row,
    validCode: "123456",
    sessions: [
      ownSession("session-1", "token", 3_000),
      ownSession("s-2", "token-2", 2_000),
      ownSession("s-3", "token-3", 1_000),
      { ...ownSession("foreign", "token-foreign", 4_000), userId: "user-2" },
    ],
    deleteSessions: (tokens) => {
      world.sessions = world.sessions.filter((entry) => !tokens.includes(entry.token));
    },
    deleteUserSessions: (userId) => {
      world.sessions = world.sessions.filter((entry) => entry.userId !== userId);
    },
    storedPasswordHash: "hash:old-password",
    resetToken: { value: base.id, createdAt: new Date(), expiresAt: new Date(Date.now() + HOUR) },
    resetCutoff: { cutoff: null },
    mail: () => {},
    provider: {
      updateUser: () => ({}),
      verifyPassword: (candidate) => {
        if (candidate === "wrong") throw providerError("INVALID_PASSWORD");
        return { status: true };
      },
      changePassword: () => ({}),
      resetPassword: () => ({}),
      disableTwoFactor: () => ({}),
      refreshUserSessions: () => {},
    },
  };
}

const meta = { entryPoint: "server-action", headers: requestHeaders };
const as = (overrides = {}) => {
  resolved = { user: { ...base, ...overrides }, session: { ...session } };
  // An enrolled account has a verified factor; one attempt of each kind can be pending.
  if (resolved.user.twoFactorEnabled) world.factor = verifiedFactor;
};
const denied = (promise, reason) => expect(promise).rejects.toMatchObject({ reason });
const grant = (version = 0) =>
  stored.set(`stepup:grant:${base.id}:${session.id}`, JSON.stringify({ verifiedAt: Date.now(), securityVersion: version }));
const failuresOf = () => counters.get(`settings:password-fail:${base.id}`) ?? 0;
/** The session store stops deleting: a revocation can then not be confirmed. */
const breakSessionStore = () => {
  world.deleteSessions = () => {};
  world.deleteUserSessions = () => {};
};

/** Runs an operation and reports whether its handler got as far as touching anything. */
async function attempt([operation, input], callMeta = meta) {
  touched.length = 0;
  try {
    return { output: await operation(input, callMeta), reached: touched.length > 0 };
  } catch (error) {
    return { error, reached: touched.length > 0 };
  }
}

const authenticated = {
  getProfile: [profile.getProfileOperation, undefined],
  getAccount: [account.getAccountOperation, undefined],
  updateName: [profile.updateDisplayNameOperation, { name: "Ada Lovelace" }],
  retryProfile: [profile.retryProfileSessionRefreshOperation, undefined],
  resendVerification: [emailChange.resendVerificationOperation, undefined],
  beginChange: [emailChange.beginEmailChangeOperation, { currentPassword: "pw" }],
  beginCorrection: [emailCorrection.beginEmailCorrectionOperation, { currentPassword: "pw", newEmail: "new@example.com" }],
  selectNew: [emailChange.selectNewEmailOperation, { requestId: REQUEST_ID, newEmail: "new@example.com" }],
  resend: [emailChange.resendEmailRequestOperation, { requestId: REQUEST_ID }],
  cancel: [emailChange.cancelEmailRequestOperation, { requestId: REQUEST_ID }],
  changePassword: [password.changePasswordOperation, { currentPassword: "pw", newPassword: "new-password-1", revokeOtherSessions: true }],
  beginEnrollment: [authenticator.beginEnrollmentOperation, { currentPassword: "pw" }],
  confirmEnrollment: [authenticator.confirmEnrollmentOperation, { requestId: SETUP_ID, code: "123456" }],
  beginReplacement: [authenticator.beginReplacementOperation, { currentPassword: "pw" }],
  confirmReplacement: [authenticator.confirmReplacementOperation, { requestId: SETUP_ID, code: "123456" }],
  cancelSetup: [authenticator.cancelSetupOperation, { requestId: SETUP_ID }],
  disable: [authenticator.disableAuthenticatorOperation, { currentPassword: "pw" }],
  retryFactor: [authenticator.retryFactorSessionRefreshOperation, undefined],
  regenerate: [recoveryCodes.regenerateRecoveryCodesOperation, { currentPassword: "pw" }],
  listSessions: [sessions.listSessionsOperation, { page: 1 }],
  revokeOne: [sessions.revokeSessionOperation, { sessionId: "s-2" }],
  revokeOthers: [sessions.revokeOtherSessionsOperation, undefined],
  revokeAll: [sessions.revokeAllSessionsOperation, undefined],
};
const publicOps = {
  inspect: [emailProof.inspectEmailProofOperation, { token: TOKEN }],
  confirm: [emailProof.confirmEmailProofOperation, { token: TOKEN }],
  reset: [completePasswordResetOperation, { token: "reset-token", newPassword: "new-password-1" }],
};

/** Section 5.3: which operations need a verified address, and which an enrolled account's step-up. */
const VERIFIED_ONLY = ["beginChange", "changePassword", "beginEnrollment", "confirmEnrollment", "beginReplacement", "confirmReplacement", "disable", "regenerate"];
const ENROLLED_STEP_UP = ["beginChange", "changePassword", "beginReplacement", "confirmReplacement", "disable", "regenerate"];

beforeEach(() => {
  stored = new Map();
  counters = new Map();
  world = freshWorld();
  as();
  touched.length = 0;
  lock.holders.length = 0;
  lock.beforeWork = null;
  for (const fn of [getSession, verifyTOTP, ...Object.values(redis)]) fn.mockClear();
  for (const level of ["log", "warn", "error"]) spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => mock.restore());

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

describe("entry points and MCP", () => {
  test("no settings operation is MCP-eligible; MCP and unknown provenance are refused before anything is touched", async () => {
    for (const [operation, input] of [...Object.values(authenticated), ...Object.values(publicOps)]) {
      expect(operation.mcpAllowed).toBe(false);
      for (const entryPoint of ["mcp", "unknown", undefined]) {
        await denied(operation(input, { ...meta, entryPoint }), "FORBIDDEN");
      }
    }
    expect(touched).toEqual([]);
  });

  test("the SSR queries run the full pipeline through the server-render entry point", async () => {
    expect(await queries.getProfileQuery(undefined)).toEqual({ name: "Ada" });
    expect(await queries.listSessionsQuery({ page: 1 })).toMatchObject({ pageSize: 20, total: 3 });
    world.request = null;
    expect(await queries.inspectEmailProofQuery({ token: TOKEN })).toEqual({ status: "inactive" });
    resolved = null;
    await denied(queries.getAccountQuery(undefined), "UNAUTHENTICATED");
  });
});

describe("identity", () => {
  test("guests are refused by every authenticated operation before anything is touched", async () => {
    resolved = null;
    for (const [operation, input] of Object.values(authenticated)) await denied(operation(input, meta), "UNAUTHENTICATED");
    expect(touched).toEqual([]);
  });

  test("every authenticated operation acts on ctx.user.id; a user ID for another account is not accepted as input", async () => {
    await denied(profile.updateDisplayNameOperation({ name: "X", userId: "user-2" }, meta), "INVALID_INPUT");
    expect(touched).toEqual([]);

    // No-input operations discard whatever the caller sends: only the actor's sessions are listed.
    await sessions.revokeOtherSessionsOperation({ userId: "user-2" }, meta);
    expect(callsTo("adapter.listSessions").map((entry) => entry.args[0])).toEqual([base.id]);
    expect(world.sessions.map((entry) => entry.id)).toEqual(["session-1", "foreign"]);

    for (const entry of Object.values(authenticated)) {
      await attempt(entry);
      for (const call of touched.filter((seen) => seen.ctx)) expect(call.ctx.user.id).toBe(base.id);
    }
  });

  test("required-but-unenrolled accounts are kept out of every authenticated settings operation, but a public proof still works", async () => {
    as({ role: "moderator", twoFactorEnabled: false });
    for (const [operation, input] of Object.values(authenticated)) await denied(operation(input, meta), "TWO_FACTOR_ENROLLMENT_REQUIRED");
    expect(touched).toEqual([]);
    world.request = null;
    expect(await emailProof.confirmEmailProofOperation({ token: TOKEN }, meta)).toEqual({ status: "inactive" });
  });

  test("public proof operations never resolve or use the browser's session", async () => {
    for (const entry of Object.values(publicOps)) {
      const { reached } = await attempt(entry);
      expect(reached).toBe(true);
      expect(getSession).not.toHaveBeenCalled();
      expect(lastCtx().user).toBeNull();
      expect(lastCtx().session).toBeNull();
    }
  });

  test("impersonated sessions cannot run the sensitive self-service operations", async () => {
    as({ twoFactorEnabled: true });
    resolved.session.impersonatedBy = "admin-1";
    for (const key of ENROLLED_STEP_UP) {
      const [operation, input] = authenticated[key];
      await denied(operation(input, meta), "IMPERSONATION_FORBIDDEN");
    }
    expect(touched).toEqual([]);
  });
});

describe("verification matrix", () => {
  test("verified, not enrolled: every handler is reached without a step-up; nothing prompts", async () => {
    for (const [key, entry] of Object.entries(authenticated)) {
      const { reached, error } = await attempt(entry);
      expect(reached, key).toBe(true);
      expect(error?.reason, key).not.toBe("TWO_FACTOR_REQUIRED");
      expect(lastCtx()?.stepUp ?? null, key).toBeNull();
    }
    expect([...stored.keys()].some((key) => key.startsWith("stepup:"))).toBe(false);
  });

  test("verified, enrolled: the sensitive operations require the five-minute step-up, satisfied by a grant of the current generation", async () => {
    as({ twoFactorEnabled: true, securityVersion: 4 });
    world.setup = setupRow({ kind: "replace", authorizedSecurityVersion: 4, replacementSecret: "encrypted:new-secret", currentFactorFingerprint: "fp:encrypted-active" });
    for (const key of ENROLLED_STEP_UP) {
      const [operation, input] = authenticated[key];
      await denied(operation(input, meta), "TWO_FACTOR_REQUIRED");
    }
    expect(touched).toEqual([]);
    grant(3);
    await denied(authenticated.changePassword[0](authenticated.changePassword[1], meta), "TWO_FACTOR_REQUIRED");
    for (const key of ENROLLED_STEP_UP) {
      grant(4);
      const { reached } = await attempt(authenticated[key]);
      expect(reached, key).toBe(true);
      expect(lastCtx().stepUp, key).toBe("five_minutes");
    }
    // The rest never prompts.
    for (const key of Object.keys(authenticated).filter((entry) => !ENROLLED_STEP_UP.includes(entry))) {
      stored.clear();
      const { reached, error } = await attempt(authenticated[key]);
      expect(reached, key).toBe(true);
      expect(error?.reason, key).not.toBe("TWO_FACTOR_REQUIRED");
    }
  });

  test("unverified, not enrolled: reads, name, sessions, verification resend and the correction work; the rest need a verified address", async () => {
    as({ emailVerified: false });
    for (const [key, entry] of Object.entries(authenticated)) {
      const { reached, error } = await attempt(entry);
      if (VERIFIED_ONLY.includes(key)) {
        expect(error?.reason, key).toBe("EMAIL_VERIFICATION_REQUIRED");
        expect(reached, key).toBe(false);
      } else {
        expect(reached, key).toBe(true);
      }
    }
  });

  test("unverified, enrolled: the correction is admitted without the shared step-up and checks the code itself", async () => {
    as({ emailVerified: false, twoFactorEnabled: true });
    const started = await emailCorrection.beginEmailCorrectionOperation(
      { ...authenticated.beginCorrection[1], authenticatorCode: "123456" },
      meta,
    );
    expect(started).toMatchObject({ status: "pending", delivery: "sent" });
    expect(lastCtx().stepUp).toBeNull();
    // The handler verified the code, without persisting a reusable grant.
    expect(verifyTOTP).toHaveBeenCalledTimes(1);
    expect([...stored.keys()].some((key) => key.startsWith("stepup:grant"))).toBe(false);
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
    expect((await attempt(authenticated.beginChange)).output).toMatchObject({ status: "pending" });
    expect((await attempt(authenticated.updateName)).output).toEqual({ status: "completed" });
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
    await denied(emailProof.confirmEmailProofOperation({ token: TOKEN, userId: "u" }, meta), "INVALID_INPUT");
    await denied(emailProof.confirmEmailProofOperation({ token: `${"A".repeat(42)}!` }, meta), "INVALID_INPUT");
    await denied(authenticator.confirmEnrollmentOperation({ requestId: SETUP_ID, code: "12345" }, meta), "INVALID_INPUT");
    await denied(emailCorrection.beginEmailCorrectionOperation({ currentPassword: "pw", newEmail: "not-an-email" }, meta), "INVALID_INPUT");
    await denied(emailCorrection.beginEmailCorrectionOperation({ currentPassword: "pw", newEmail: "x@example.com", authenticatorCode: "abc" }, meta), "INVALID_INPUT");
    await denied(sessions.listSessionsOperation({ page: 0 }, meta), "INVALID_INPUT");
    await denied(sessions.listSessionsOperation({ page: 1.5 }, meta), "INVALID_INPUT");
    // Invalid input consumes nothing: no attempt is charged, no seam is reached.
    expect(touched).toEqual([]);
    expect(counters.size).toBe(0);

    // Normalization: the address is trimmed and lowercased; the password is never trimmed.
    as({ emailVerified: false });
    await emailCorrection.beginEmailCorrectionOperation({ currentPassword: " pw ", newEmail: "  New@Example.com " }, meta);
    expect(callsTo("auth.api.verifyPassword")[0].args[0].body.password).toBe(" pw ");
    expect(callsTo("replaceActiveRequest")[0].args[0]).toMatchObject({ kind: "correction", newEmail: "new@example.com" });
  });

  test("an identifier that cannot be a UUID matches nothing, without a query", async () => {
    expect(await emailChange.cancelEmailRequestOperation({ requestId: "r1" }, meta)).toEqual({ status: "unchanged" });
    expect(await authenticator.cancelSetupOperation({ requestId: "s1" }, meta)).toEqual({ status: "unchanged" });
    await denied(emailChange.resendEmailRequestOperation({ requestId: "r1" }, meta), "NOT_FOUND");
    await denied(authenticator.confirmEnrollmentOperation({ requestId: "s1", code: "123456" }, meta), "CONFLICT");
    expect(touched).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Coordination
// ---------------------------------------------------------------------------

describe("the security lock", () => {
  test("is taken by the credential and factor protocol only; ordinary operations never wait for it", async () => {
    world.setup = setupRow({ kind: "replace", replacementSecret: "encrypted:new-secret", currentFactorFingerprint: "fp:encrypted-active" });
    const locking = [];
    for (const [key, [operation, input]] of Object.entries({ ...authenticated, ...publicOps })) {
      // The correction is the unverified account's; everything else runs as a verified, enrolled one.
      const correcting = key === "beginCorrection";
      as({ twoFactorEnabled: true, emailVerified: !correcting });
      grant();
      lock.holders.length = 0;
      world.request = requestRow(key === "confirm" ? { state: "awaiting_new", newTokenHash: "hash", currentTokenHash: null } : {});
      await attempt([operation, correcting ? { ...input, authenticatorCode: "123456" } : input]);
      if (lock.holders.length > 0) locking.push(key);
      expect(lock.holders.every((holder) => holder === base.id), key).toBe(true);
    }
    expect(locking.sort()).toEqual(
      [
        "beginChange",
        "beginCorrection",
        "changePassword",
        "beginEnrollment",
        "confirmEnrollment",
        "beginReplacement",
        "confirmReplacement",
        "cancelSetup",
        "disable",
        "regenerate",
        "confirm", // the new-address proof
        "reset",
      ].sort(),
    );
  });

  test("an operation that waited for it re-reads the security generation and refuses a superseded context", async () => {
    // Another security change commits while this one waits for the lock.
    lock.beforeWork = () => {
      resolved.user.securityVersion += 1;
    };
    const { error } = await attempt(authenticated.changePassword);
    expect(error).toMatchObject({ reason: "CONFLICT", data: { code: "SECURITY_STATE_CHANGED" } });
    expect(names()).not.toContain("retirePendingSecurityState");
    expect(names()).not.toContain("auth.api.changePassword");
  });
});

// ---------------------------------------------------------------------------
// Profile and sessions
// ---------------------------------------------------------------------------

describe("profile", () => {
  test("an unchanged name is a no-op: no provider write, no refresh", async () => {
    expect((await attempt([profile.updateDisplayNameOperation, { name: "Ada" }])).output).toEqual({ status: "unchanged" });
    expect(names()).toEqual(["findProfile"]);
  });

  test("a changed name sends exactly the name to the provider, then refreshes the cached copies", async () => {
    expect((await attempt(authenticated.updateName)).output).toEqual({ status: "completed" });
    expect(callsTo("auth.api.updateUser")[0].args[0].body).toEqual({ name: "Ada Lovelace" });
    expect(names()).toEqual(["findProfile", "auth.api.updateUser", "adapter.findUserById", "adapter.refreshUserSessions"]);
  });

  test("a provider failure propagates and refreshes nothing", async () => {
    world.provider.updateUser = () => {
      throw new Error("provider down");
    };
    const { error } = await attempt(authenticated.updateName);
    expect(error.reason).toBe("INTERNAL");
    expect(names()).not.toContain("adapter.refreshUserSessions");
  });

  test("a failed refresh after the committed write is partial, and the retry only refreshes", async () => {
    world.provider.refreshUserSessions = () => {
      throw new Error("redis down");
    };
    expect((await attempt(authenticated.updateName)).output).toEqual({ status: "partial", committed: true, failedEffects: ["session-refresh"] });
    expect((await attempt(authenticated.retryProfile)).output).toEqual({ status: "partial", committed: false, failedEffects: ["session-refresh"] });

    world.provider.refreshUserSessions = () => {};
    expect((await attempt(authenticated.retryProfile)).output).toEqual({ status: "completed" });
    expect(names()).toEqual(["adapter.findUserById", "adapter.refreshUserSessions"]);
  });

  test("a missing account is NOT_FOUND for the read and the write", async () => {
    world.profile = null;
    await denied(profile.getProfileOperation(undefined, meta), "NOT_FOUND");
    await denied(profile.updateDisplayNameOperation({ name: "X" }, meta), "NOT_FOUND");
    expect(names()).not.toContain("auth.api.updateUser");
  });
});

describe("sessions", () => {
  test("the list is the actor's own, current first then newest, and never carries a token", async () => {
    const page = await sessions.listSessionsOperation({ page: 1 }, meta);
    expect(page.items.map((item) => item.id)).toEqual(["session-1", "s-2", "s-3"]);
    expect(page.items[0].isCurrent).toBe(true);
    expect(JSON.stringify(page)).not.toContain("token");
    // A page past the end folds onto the last one.
    expect((await sessions.listSessionsOperation({ page: 7 }, meta)).page).toBe(1);
  });

  test("revoking one: another account's session, an unknown ID and the current session are no-ops without a provider call", async () => {
    for (const sessionId of ["foreign", "missing", "session-1"]) {
      expect((await attempt([sessions.revokeSessionOperation, { sessionId }])).output).toEqual({ status: "unchanged" });
      expect(names()).toEqual(["adapter.listSessions"]);
    }
    expect(world.sessions).toHaveLength(4);
  });

  test("revoking one resolves the token among the actor's sessions and confirms the removal", async () => {
    expect((await attempt(authenticated.revokeOne)).output).toEqual({ status: "completed" });
    expect(callsTo("auth.api.revokeSession")[0].args[0].body).toEqual({ token: "token-2" });
    expect(world.sessions.map((entry) => entry.id)).toEqual(["session-1", "s-3", "foreign"]);
  });

  test("revoking the others spares the current session; with none left it is a no-op", async () => {
    expect((await attempt(authenticated.revokeOthers)).output).toEqual({ status: "completed" });
    expect(callsTo("adapter.deleteSessions")[0].args[0]).toEqual(["token-2", "token-3"]);
    expect((await attempt(authenticated.revokeOthers)).output).toEqual({ status: "unchanged" });
    expect(names()).toEqual(["adapter.listSessions"]);
  });

  test("a revocation the store does not confirm is partial and uncommitted, never completed", async () => {
    breakSessionStore();
    const unconfirmed = { status: "partial", committed: false, failedEffects: ["session-revocation"] };
    expect((await attempt(authenticated.revokeOne)).output).toEqual(unconfirmed);
    expect((await attempt(authenticated.revokeOthers)).output).toEqual(unconfirmed);
    expect((await attempt(authenticated.revokeAll)).output).toEqual(unconfirmed);
  });

  test("signing out everywhere reports that this device went too", async () => {
    expect((await attempt(authenticated.revokeAll)).output).toEqual({ status: "completed", selfSignedOut: true });
    expect(world.sessions.map((entry) => entry.id)).toEqual(["foreign"]);
  });
});

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

describe("current password", () => {
  const change = (currentPassword) => [password.changePasswordOperation, { currentPassword, newPassword: "new-password-1", revokeOtherSessions: false }];

  test("a wrong password keeps its charge and retires nothing", async () => {
    const { error } = await attempt(change("wrong"));
    expect(error).toMatchObject({ reason: "INVALID_INPUT", data: { field: "currentPassword", code: "INCORRECT_PASSWORD" } });
    expect(failuresOf()).toBe(1);
    expect(lock.holders).toEqual([]);
    expect(names()).toEqual(["auth.api.verifyPassword"]);
  });

  test("a correct password clears the streak; an infrastructure failure hands its reservation back", async () => {
    await attempt(change("wrong"));
    await attempt(change("wrong"));
    expect(failuresOf()).toBe(2);

    world.provider.verifyPassword = () => {
      throw new Error("database down");
    };
    expect((await attempt(change("pw"))).error.reason).toBe("INTERNAL");
    expect(failuresOf()).toBe(2);

    world.provider.verifyPassword = () => ({ status: true });
    expect((await attempt(change("pw"))).output).toEqual({ status: "completed" });
    expect(counters.has(`settings:password-fail:${base.id}`)).toBe(false);
  });

  test("the budget refuses before the provider is asked", async () => {
    for (let count = 0; count < 5; count += 1) await attempt(change("wrong"));
    const { error } = await attempt(change("pw"));
    expect(error).toMatchObject({ reason: "RATE_LIMITED", data: { retryAfterSeconds: 60 } });
    expect(touched).toEqual([]);
  });
});

describe("password change", () => {
  test("order: verify, then under the lock the generation check, retirement, the provider write", async () => {
    const keepingSessions = { ...authenticated.changePassword[1], revokeOtherSessions: false };
    expect((await attempt([password.changePasswordOperation, keepingSessions])).output).toEqual({ status: "completed" });
    expect(names().slice(0, 3)).toEqual(["auth.api.verifyPassword", "retirePendingSecurityState", "auth.api.changePassword"]);
    expect(callsTo("retirePendingSecurityState")[0].args).toEqual([base.id, "credentials"]);
  });

  test("a provider refusal after retirement propagates; the retirement is not undone", async () => {
    world.provider.changePassword = () => {
      throw new Error("provider down");
    };
    const { error } = await attempt(authenticated.changePassword);
    expect(error.reason).toBe("INTERNAL");
    expect(names()).toContain("retirePendingSecurityState");
    expect(names().at(-1)).toBe("adapter.findCredentialAccount");
  });

  test("a provider error after the hash was written is partial, not a failure", async () => {
    world.storedPasswordHash = "hash:new-password-1";
    world.provider.changePassword = () => {
      throw new Error("session renewal failed");
    };
    expect((await attempt(authenticated.changePassword)).output).toEqual({
      status: "partial",
      committed: true,
      failedEffects: ["session-renewal"],
    });
  });

  test("the provider's own wrong-password refusal is the field error", async () => {
    world.provider.changePassword = () => {
      throw providerError("INVALID_PASSWORD");
    };
    const { error } = await attempt(authenticated.changePassword);
    expect(error).toMatchObject({ reason: "INVALID_INPUT", data: { code: "INCORRECT_PASSWORD" } });
  });

  test("sign out other devices is observed: sessions that remain make the outcome partial", async () => {
    expect((await attempt(authenticated.changePassword)).output).toEqual({
      status: "partial",
      committed: true,
      failedEffects: ["session-revocation"],
    });
    world.sessions = world.sessions.filter((entry) => entry.id === "session-1");
    expect((await attempt(authenticated.changePassword)).output).toEqual({ status: "completed" });
  });
});

describe("password reset", () => {
  test("the token is the whole authority: read again under the target's lock, then retirement, then the provider", async () => {
    expect((await attempt(publicOps.reset)).output).toEqual({ status: "completed" });
    expect(lock.holders).toEqual([base.id]);
    expect(names()).toEqual([
      "adapter.findVerificationValue",
      "adapter.findVerificationValue",
      "findResetCutoff",
      "retirePendingSecurityState",
      "auth.api.resetPassword",
    ]);
  });

  test("an unknown, expired or superseded link is refused identically and retires nothing", async () => {
    const refused = { reason: "FORBIDDEN", data: { code: "INACTIVE" } };
    const cases = [
      () => (world.resetToken = null),
      () => (world.resetToken.expiresAt = new Date(Date.now() - 1)),
      () => (world.resetCutoff = null),
      () => (world.resetCutoff = { cutoff: new Date(Date.now() + HOUR) }),
    ];
    for (const arrange of cases) {
      world = freshWorld();
      arrange();
      expect((await attempt(publicOps.reset)).error).toMatchObject(refused);
      expect(names()).not.toContain("retirePendingSecurityState");
      expect(names()).not.toContain("auth.api.resetPassword");
    }
  });

  test("a token consumed or re-pointed while waiting for the lock is refused", async () => {
    lock.beforeWork = () => {
      world.resetToken = { ...world.resetToken, value: "user-2" };
    };
    expect((await attempt(publicOps.reset)).error).toMatchObject({ reason: "FORBIDDEN" });
    expect(names()).not.toContain("retirePendingSecurityState");
  });

  test("provider refusals become the page's link and field errors", async () => {
    world.provider.resetPassword = () => {
      throw providerError("INVALID_TOKEN");
    };
    expect((await attempt(publicOps.reset)).error).toMatchObject({ reason: "FORBIDDEN", data: { code: "INACTIVE" } });
    world.provider.resetPassword = () => {
      throw providerError("PASSWORD_TOO_SHORT");
    };
    expect((await attempt(publicOps.reset)).error).toMatchObject({ reason: "INVALID_INPUT", data: { field: "newPassword" } });
  });
});

// ---------------------------------------------------------------------------
// Email change
// ---------------------------------------------------------------------------

describe("email change: starting", () => {
  test("a wrong password replaces nothing and spends no initiation", async () => {
    const { error } = await attempt([emailChange.beginEmailChangeOperation, { currentPassword: "wrong" }]);
    expect(error.reason).toBe("INVALID_INPUT");
    expect(names()).toEqual(["auth.api.verifyPassword"]);
    expect(counters.has(`settings:email-init:${base.id}`)).toBe(false);
  });

  test("the request is stored under the lock and mailed after it; the deadline is 24 hours", async () => {
    const before = Date.now();
    const { output } = await attempt(authenticated.beginChange);
    expect(output).toMatchObject({ status: "pending", delivery: "sent", request: { state: "awaiting_current" } });
    const [values] = callsTo("replaceActiveRequest")[0].args;
    expect(values.expiresAt.getTime() - values.createdAt.getTime()).toBe(24 * HOUR);
    expect(values.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    // Only the digest is stored; the mail carries the token.
    const [message] = callsTo("mail.emailChange")[0].args;
    expect(values.currentTokenHash).toHaveLength(64);
    expect(message).toMatchObject({ to: base.email, purpose: "current" });
    expect(message.token).not.toBe(values.currentTokenHash);
    // Stored while the lock is held; mailed after it is released.
    expect(callsTo("replaceActiveRequest")[0].locked).toBe(true);
    expect(callsTo("mail.emailChange")[0].locked).toBe(false);
  });

  test("a mail failure or a spent allowance keeps the stored request and says so", async () => {
    world.mail = () => {
      throw new Error("mailer down");
    };
    expect((await attempt(authenticated.beginChange)).output).toMatchObject({ status: "pending", delivery: "failed" });

    world.mail = () => {};
    // The cooldown of the send above is still running.
    const limited = (await attempt(authenticated.beginChange)).output;
    expect(limited).toMatchObject({ status: "pending", delivery: "rate-limited", retryAfterSeconds: 60 });
    expect(names()).toContain("replaceActiveRequest");
    expect(names()).not.toContain("mail.emailChange");
  });

  test("a correction refuses a verified account, an unchanged and a taken address before anything is stored", async () => {
    const correction = (newEmail) => [emailCorrection.beginEmailCorrectionOperation, { currentPassword: "pw", newEmail }];
    expect((await attempt(correction("new@example.com"))).error).toMatchObject({ reason: "CONFLICT", data: { code: "INACTIVE" } });

    as({ emailVerified: false });
    expect((await attempt(correction(base.email))).error).toMatchObject({ data: { code: "EMAIL_UNCHANGED" } });
    expect((await attempt(correction("taken@example.com"))).error).toMatchObject({ data: { code: "EMAIL_UNAVAILABLE" } });
    expect(counters.has(`settings:email-init:${base.id}`)).toBe(false);

    // Both wrong at once: the unchanged address is reported, and availability is never queried.
    world.takenAddresses.push(base.email);
    await attempt(correction(base.email));
    expect(names()).not.toContain("isAddressTaken");

    const { output } = await attempt(correction("new@example.com"));
    expect(output).toMatchObject({ delivery: "sent", request: { state: "awaiting_new", kind: "correction" } });
    // Nothing is ever mailed to the address being corrected.
    expect(callsTo("mail.emailChange").map((entry) => entry.args[0].to)).toEqual(["new@example.com"]);
  });

  test("a correction of an enrolled account needs the code; an account without a factor must not send one", async () => {
    as({ emailVerified: false });
    const withCode = [emailCorrection.beginEmailCorrectionOperation, { currentPassword: "pw", newEmail: "new@example.com", authenticatorCode: "123456" }];
    expect((await attempt(withCode)).error).toMatchObject({ data: { code: "AUTHENTICATOR_NOT_ENROLLED" } });
    as({ emailVerified: false, twoFactorEnabled: true });
    expect((await attempt(authenticated.beginCorrection)).error).toMatchObject({ data: { code: "AUTHENTICATOR_CODE_REQUIRED" } });
    expect(names()).not.toContain("replaceActiveRequest");
  });
});

describe("email change: choosing the new address", () => {
  const awaitingAddress = () => requestRow({ state: "awaiting_new_address", currentConfirmedAt: new Date(), currentTokenHash: null });

  test("only after the current mailbox agreed, and only once", async () => {
    expect((await attempt(authenticated.selectNew)).error).toMatchObject({ reason: "CONFLICT", message: "auth.errors.confirmCurrentAddressFirst" });
    world.request = requestRow({ state: "awaiting_new", newEmail: "x@example.com" });
    expect((await attempt(authenticated.selectNew)).error.message).toBe("auth.errors.newAddressAlreadyChosen");
    expect(names()).not.toContain("selectNewAddress");
  });

  test("an account whose address changed meanwhile closes the request", async () => {
    world.request = awaitingAddress();
    world.owner = { id: base.id, email: "moved@example.com", emailVerified: true };
    expect((await attempt(authenticated.selectNew)).error).toMatchObject({ reason: "NOT_FOUND", data: { code: "INACTIVE" } });
    expect(callsTo("markCancelled")[0].args.slice(0, 2)).toEqual([REQUEST_ID, "account_changed"]);
    expect(names()).not.toContain("selectNewAddress");
  });

  test("an overdue request is marked expired and says so; an expired and wrong-stage request reports the stage first as before", async () => {
    world.request = requestRow({ expiresAt: new Date(Date.now() - 1) });
    expect((await attempt(authenticated.selectNew)).error).toMatchObject({ reason: "CONFLICT", data: { code: "EXPIRED" } });
    expect(names()).toEqual(["findOwnedRequest", "markExpired"]);
  });

  test("the stored selection is what gets mailed", async () => {
    world.request = awaitingAddress();
    const { output } = await attempt(authenticated.selectNew);
    expect(output).toMatchObject({ delivery: "sent", request: { state: "awaiting_new", newEmail: "new@example.com" } });
    const [selection] = callsTo("selectNewAddress")[0].args;
    expect(selection).toMatchObject({ requestId: REQUEST_ID, newEmail: "new@example.com" });
    expect(callsTo("mail.emailChange")[0].args[0]).toMatchObject({ to: "new@example.com", purpose: "new" });
  });

  test("a conditional write that matched nothing reports no success and mails nothing", async () => {
    world.request = awaitingAddress();
    world.conditionalWriteMatches = false;
    expect((await attempt(authenticated.selectNew)).error).toMatchObject({ reason: "NOT_FOUND", data: { code: "INACTIVE" } });
    expect(names()).not.toContain("mail.emailChange");
    expect(stored.has(`settings:email-send:${base.id}:new`)).toBe(false);
  });
});

describe("email change: resending", () => {
  const sendsCharged = () => counters.get(`settings:email-sends:${base.id}`) ?? 0;

  test("rotates the observed stage and generation, then mails the stored token; the deadline is untouched", async () => {
    const { output } = await attempt(authenticated.resend);
    expect(output).toMatchObject({ delivery: "sent", request: { expiresAt: world.request.expiresAt.toISOString() } });
    const [rotation] = callsTo("rotateToken")[0].args;
    expect(rotation).toMatchObject({ purpose: "current", observedState: "awaiting_current", observedGeneration: 1 });
    expect(rotation).not.toHaveProperty("expiresAt");
    const [message] = callsTo("mail.emailChange")[0].args;
    expect(message.to).toBe(base.email);
    const { createHash } = await import("node:crypto");
    expect(createHash("sha256").update(message.token).digest("hex")).toBe(rotation.tokenHash);
    expect(sendsCharged()).toBe(1);
  });

  test("inside the cooldown the refusal is a rate limit: nothing rotates, nothing is charged", async () => {
    stored.set(`settings:email-send:${base.id}:current`, "1");
    const { error } = await attempt(authenticated.resend);
    expect(error).toMatchObject({ reason: "RATE_LIMITED", data: { retryAfterSeconds: 60 } });
    expect(names()).toEqual(["findOwnedRequest"]);
    expect(sendsCharged()).toBe(0);
  });

  test("a spent hourly allowance returns the request unchanged as rate-limited, without rotating", async () => {
    counters.set(`settings:email-sends:${base.id}`, 10);
    const { output } = await attempt(authenticated.resend);
    expect(output).toMatchObject({ status: "pending", delivery: "rate-limited", retryAfterSeconds: 60, request: { id: REQUEST_ID } });
    expect(names()).not.toContain("rotateToken");
    expect(names()).not.toContain("mail.emailChange");
  });

  test("a rotation lost to a concurrent step mails nothing; its reservation stays charged, once", async () => {
    world.conditionalWriteMatches = false;
    const { error } = await attempt(authenticated.resend);
    expect(error).toMatchObject({ reason: "NOT_FOUND", data: { code: "INACTIVE" } });
    expect(names()).not.toContain("mail.emailChange");
    expect(stored.has(`settings:email-send:${base.id}:current`)).toBe(true);
    expect(sendsCharged()).toBe(1);
  });

  test("a failed delivery is reported and charged once; nothing is retried", async () => {
    world.mail = () => {
      throw new Error("mailer down");
    };
    expect((await attempt(authenticated.resend)).output).toMatchObject({ delivery: "failed" });
    expect(callsTo("mail.emailChange")).toHaveLength(1);
    expect(sendsCharged()).toBe(1);
  });

  test("a stage that awaits no mail has nothing to resend", async () => {
    world.request = requestRow({ state: "awaiting_new_address", currentTokenHash: null });
    expect((await attempt(authenticated.resend)).error).toMatchObject({ reason: "CONFLICT", data: { code: "INACTIVE" } });
    expect(names()).toEqual(["findOwnedRequest"]);
  });
});

describe("email change: the account page", () => {
  test("closes a request that can no longer authorize anything and shows none", async () => {
    world.request = requestRow({ expiresAt: new Date(Date.now() - 1) });
    expect((await attempt(authenticated.getAccount)).output.pendingEmail).toEqual({ state: "none" });
    expect(names()).toContain("markExpired");

    world.request = requestRow({ originalEmail: "older@example.com" });
    expect((await attempt(authenticated.getAccount)).output.pendingEmail).toEqual({ state: "none" });
    expect(callsTo("markCancelled")[0].args.slice(0, 2)).toEqual([REQUEST_ID, "account_changed"]);

    // Overdue and superseded at once: it expired.
    world.request = requestRow({ originalEmail: "older@example.com", expiresAt: new Date(Date.now() - 1) });
    await attempt(authenticated.getAccount);
    expect(names()).toContain("markExpired");
    expect(names()).not.toContain("markCancelled");
  });

  test("computes the enrollment requirement from role and stored policy", async () => {
    expect((await attempt(authenticated.getAccount)).output).toMatchObject({ twoFactorRequired: false, pendingEmail: { state: "awaiting_current" } });
    as({ role: "admin", twoFactorEnabled: true });
    expect((await attempt(authenticated.getAccount)).output.twoFactorRequired).toBe(true);
  });
});

describe("email proofs", () => {
  const charged = (key) => counters.get(key) ?? 0;

  test("every submit is charged before it learns anything: to the request, or to the client address", async () => {
    world.request = requestRow({ state: "cancelled", currentTokenHash: null });
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "inactive" });
    expect(charged(`settings:proof:${REQUEST_ID}`)).toBe(1);

    world.request = null;
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "inactive" });
    expect([...counters.keys()].filter((key) => key.startsWith("settings:proof-ip:"))).toHaveLength(1);
    expect(names()).toEqual(["findRequestByTokenHash"]);
  });

  test("inspection reads and charges nothing", async () => {
    world.request = requestRow({ currentTokenHash: sha256(TOKEN) });
    expect((await attempt(publicOps.inspect)).output).toMatchObject({ status: "confirmable", purpose: "current" });
    expect(names()).toEqual(["findRequestByTokenHash"]);
    expect(counters.size).toBe(0);

    world.request = requestRow({ currentTokenHash: sha256(TOKEN), expiresAt: new Date(Date.now() - 1) });
    expect((await attempt(publicOps.inspect)).output).toEqual({ status: "expired" });
    // A link of an earlier stage proves nothing at the current one.
    world.request = requestRow({ state: "awaiting_new", currentTokenHash: sha256(TOKEN), newTokenHash: "other" });
    expect((await attempt(publicOps.inspect)).output).toEqual({ status: "inactive" });
  });

  test("the current mailbox's proof is one conditional write, without the lock", async () => {
    world.request = requestRow({ currentTokenHash: sha256(TOKEN) });
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "current-confirmed" });
    expect(callsTo("confirmCurrentAddress")[0].args[0]).toMatchObject({ requestId: REQUEST_ID, tokenHash: sha256(TOKEN) });
    expect(lock.holders).toEqual([]);

    // Lost: overdue is told apart from a link that simply no longer matches.
    world.conditionalWriteMatches = false;
    world.overdue = true;
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "expired" });
    world.overdue = false;
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "inactive" });
  });
});

describe("email finalization", () => {
  const hash = sha256(TOKEN);
  const writes = () => ({
    expire: mock(async () => {}),
    cancel: mock(async () => {}),
    isTakenByAnotherAccount: mock(async (email) => world.takenAddresses.includes(email)),
    commitNewAddress: mock(async () => 7),
  });
  const accountRow = (overrides = {}) => ({ id: base.id, email: base.email, emailVerified: true, banned: false, banExpires: null, ...overrides });
  const awaitingNew = (overrides = {}) =>
    requestRow({ state: "awaiting_new", newEmail: "new@example.com", newTokenHash: hash, currentTokenHash: null, currentConfirmedAt: new Date(), ...overrides });

  function arrange({ account = accountRow(), request = awaitingNew() } = {}) {
    world.request = awaitingNew();
    world.locked = { account, request, writes: writes() };
    return world.locked.writes;
  }

  test("commits the address, then revokes every session and clears the barrier for the generation it wrote", async () => {
    const made = arrange();
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "completed", sessionRevocationPending: false });
    expect(made.commitNewAddress).toHaveBeenCalledWith("new@example.com");
    expect(lock.holders).toEqual([base.id]);
    expect(world.sessions.map((entry) => entry.id)).toEqual(["foreign"]);
    expect(names().indexOf("adapter.findSessions")).toBeLessThan(names().indexOf("barrier.clear"));
  });

  test("a revocation that fails keeps the barrier and says so; the change stays committed", async () => {
    arrange();
    breakSessionStore();
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "completed", sessionRevocationPending: true });
    expect(names()).not.toContain("barrier.clear");
  });

  test("the locked rows decide, not the rows read before the lock", async () => {
    const cases = [
      [{ request: awaitingNew({ state: "cancelled" }) }, "inactive", null],
      [{ request: awaitingNew({ newTokenHash: "rotated" }) }, "inactive", null],
      [{ request: awaitingNew({ expiresAt: new Date(Date.now() - 1) }) }, "expired", "expire"],
      [{ account: accountRow({ banned: true }) }, "account-changed", "cancel"],
      [{ account: accountRow({ email: "moved@example.com" }) }, "account-changed", "cancel"],
      [{ account: accountRow({ emailVerified: false }) }, "account-changed", "cancel"],
      [{ request: awaitingNew({ currentConfirmedAt: null }) }, "account-changed", "cancel"],
      [{ request: awaitingNew({ kind: "correction" }) }, "account-changed", "cancel"],
      [{ request: awaitingNew({ newEmail: "taken@example.com" }) }, "destination-unavailable", "cancel"],
      [{ request: awaitingNew({ newEmail: base.email }) }, "destination-unavailable", "cancel"],
    ];
    for (const [rows, status, write] of cases) {
      const made = arrange(rows);
      expect((await attempt(publicOps.confirm)).output, status).toEqual({ status });
      expect(made.commitNewAddress).not.toHaveBeenCalled();
      // The refusal is returned, so the transition it wrote commits with it.
      for (const name of ["expire", "cancel"]) expect(made[name]).toHaveBeenCalledTimes(name === write ? 1 : 0);
      expect(names()).not.toContain("adapter.deleteSessions");
    }
  });

  test("precedence when several things are wrong: a mismatch before expiry, expiry before the account", async () => {
    let made = arrange({ request: awaitingNew({ newTokenHash: "rotated", expiresAt: new Date(Date.now() - 1) }) });
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "inactive" });
    expect(made.expire).not.toHaveBeenCalled();

    made = arrange({ account: accountRow({ banned: true }), request: awaitingNew({ expiresAt: new Date(Date.now() - 1) }) });
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "expired" });
    expect(made.cancel).not.toHaveBeenCalled();

    made = arrange({ account: accountRow({ banned: true }), request: awaitingNew({ newEmail: "taken@example.com" }) });
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "account-changed" });
    expect(made.cancel).toHaveBeenCalledWith("banned");
  });

  test("an address claimed by another account during the commit closes the request as unavailable", async () => {
    arrange();
    world.finalizationConflict = true;
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "destination-unavailable" });
    expect(callsTo("markCancelled")[0].args.slice(0, 2)).toEqual([REQUEST_ID, "account_changed"]);
    expect(names()).not.toContain("adapter.deleteSessions");
  });

  test("rows that are gone are an inactive link", async () => {
    world.request = awaitingNew();
    world.locked = null;
    expect((await attempt(publicOps.confirm)).output).toEqual({ status: "inactive" });
  });
});

// ---------------------------------------------------------------------------
// Authenticator
// ---------------------------------------------------------------------------

describe("authenticator setup", () => {
  const confirm = (overrides = {}) => [authenticator.confirmEnrollmentOperation, { requestId: SETUP_ID, code: "123456", ...overrides }];
  const pendingFactor = { id: "factor-1", userId: base.id, secret: "encrypted-pending", verified: false, backupCodes: "codes" };
  const attemptsCharged = () => counters.get(`settings:factor-code:${SETUP_ID}`) ?? 0;

  test("enrollment clears an earlier attempt, lets the provider create the row, then binds the attempt to it", async () => {
    const { output } = await attempt(authenticated.beginEnrollment);
    expect(output).toMatchObject({ status: "pending", kind: "enroll", requestId: SETUP_ID, manualKey: "MANUALKEY" });
    const order = names();
    expect(order.indexOf("cancelPendingSetups")).toBeLessThan(order.indexOf("auth.api.enableTwoFactor"));
    expect(order.indexOf("auth.api.enableTwoFactor")).toBeLessThan(order.indexOf("insertSetup"));
    expect(callsTo("insertSetup")[0].args[0]).toMatchObject({ kind: "enroll", currentFactorId: "factor-1", currentFactorFingerprint: "fp:encrypted-pending" });
  });

  test("an attempt that cannot be recorded removes the provider's pending row again", async () => {
    world.insertSetup = () => {
      throw new Error("insert failed");
    };
    expect((await attempt(authenticated.beginEnrollment)).error.reason).toBe("INTERNAL");
    expect(callsTo("deleteUnverifiedFactor")[0].args).toEqual(["factor-1"]);
  });

  test("an enrolled account is told to replace instead, before an initiation is spent", async () => {
    world.factor = verifiedFactor;
    expect((await attempt(authenticated.beginEnrollment)).error).toMatchObject({ reason: "CONFLICT", data: { code: "INACTIVE" } });
    expect(counters.has(`settings:factor-init:${base.id}`)).toBe(false);
    expect(names()).not.toContain("auth.api.enableTwoFactor");
  });

  test("binding precedence: state and kind, then expiry, then the session and generation", async () => {
    world.factor = pendingFactor;
    const foreignSession = { initiatingSessionId: "another-session" };
    const overdue = { expiresAt: new Date(Date.now() - 1) };

    world.setup = setupRow({ kind: "replace", ...overdue });
    expect((await attempt(confirm())).error).toMatchObject({ data: { code: "SETUP_REPLACED" } });
    expect(names()).not.toContain("markSetupExpired");

    world.setup = setupRow({ ...overdue, ...foreignSession });
    expect((await attempt(confirm())).error).toMatchObject({ data: { code: "EXPIRED" } });
    expect(names()).toContain("markSetupExpired");

    world.setup = setupRow(foreignSession);
    expect((await attempt(confirm())).error).toMatchObject({ data: { code: "SETUP_REPLACED" } });
    world.setup = setupRow({ authorizedSecurityVersion: 3 });
    expect((await attempt(confirm())).error).toMatchObject({ data: { code: "SETUP_REPLACED" } });
    expect(attemptsCharged()).toBe(0);
  });

  test("a factor that is no longer the attempt's is refused before a code attempt is charged", async () => {
    world.factor = { ...pendingFactor, secret: "encrypted-other" };
    expect((await attempt(confirm())).error).toMatchObject({ data: { code: "SETUP_REPLACED" } });
    expect(attemptsCharged()).toBe(0);
    expect(verifyTOTP).not.toHaveBeenCalled();
  });

  test("the attempt is charged before the code is checked, and the generation moves before the provider verifies", async () => {
    world.factor = pendingFactor;
    verifyTOTP.mockImplementationOnce(async () => {
      touched.push({ name: "auth.api.verifyTOTP" });
      throw providerError("INVALID_CODE");
    });
    expect((await attempt(confirm())).error).toMatchObject({ reason: "INVALID_INPUT", data: { code: "INVALID_CODE" } });
    expect(attemptsCharged()).toBe(1);
    expect(names().indexOf("advanceSecurityVersion")).toBeLessThan(names().indexOf("auth.api.verifyTOTP"));
    expect(names()).not.toContain("markSetupCompleted");
  });

  test("a proven code hands out the codes once; the same code again is refused", async () => {
    world.factor = pendingFactor;
    expect((await attempt(confirm())).output).toMatchObject({ status: "completed", recoveryCodes: ["eeeee-fffff"], failedEffects: [] });
    expect(names()).toContain("markSetupCompleted");
    expect((await attempt(confirm())).error).toMatchObject({ data: { code: "INVALID_CODE" } });
  });

  test("a completion that already won leaves nothing to prove and returns no codes", async () => {
    world.factor = { ...pendingFactor, verified: true };
    expect((await attempt(confirm())).output).toEqual({ status: "completed-codes-unavailable", action: "regenerate-recovery-codes" });
    expect(verifyTOTP).not.toHaveBeenCalled();
    expect(attemptsCharged()).toBe(0);
  });

  test("cancelling names its attempt and reports whether that attempt was there", async () => {
    expect((await attempt(authenticated.cancelSetup)).output).toEqual({ status: "completed" });
    expect(callsTo("cancelSetupRequest")[0].args[0]).toBe(SETUP_ID);
    world.cancels = false;
    expect((await attempt(authenticated.cancelSetup)).output).toEqual({ status: "unchanged" });
    expect(names()).not.toContain("cancelPendingSetups");
  });
});

describe("authenticator replacement", () => {
  const replacing = () => setupRow({ kind: "replace", replacementSecret: "encrypted:new-secret", currentFactorFingerprint: "fp:encrypted-active" });
  const enrolled = () => {
    as({ twoFactorEnabled: true });
    grant();
    world.setup = replacing();
  };

  test("staging writes the attempt and leaves the active factor alone", async () => {
    enrolled();
    const { output } = await attempt(authenticated.beginReplacement);
    expect(output).toMatchObject({ status: "pending", kind: "replace", manualKey: "new-secret" });
    expect(callsTo("insertSetup")[0].args[0]).toMatchObject({ kind: "replace", currentFactorId: "factor-1", replacementSecret: "encrypted:new-secret" });
    expect(names()).not.toContain("swapFactor");
    expect(names()).not.toContain("auth.api.enableTwoFactor");
  });

  test("an account without a factor is refused; nothing is staged", async () => {
    expect((await attempt(authenticated.beginReplacement)).error).toMatchObject({ reason: "CONFLICT", data: { code: "INACTIVE" } });
    expect(names()).not.toContain("insertSetup");
  });

  test("a wrong code is charged and swaps nothing", async () => {
    enrolled();
    const { error } = await attempt([authenticator.confirmReplacementOperation, { requestId: SETUP_ID, code: "000000" }]);
    expect(error).toMatchObject({ data: { code: "INVALID_CODE" } });
    expect(counters.get(`settings:factor-code:${SETUP_ID}`)).toBe(1);
    expect(names()).not.toContain("swapFactor");
  });

  test("the swap is bound to the attempt and its factor; the codes returned are the ones stored", async () => {
    enrolled();
    const { output } = await attempt(authenticated.confirmReplacement);
    expect(output).toMatchObject({ status: "completed", recoveryCodes: ["ccccc-ddddd"], failedEffects: [] });
    expect(callsTo("swapFactor")[0].args[0]).toMatchObject({
      requestId: SETUP_ID,
      factorId: "factor-1",
      factorFingerprint: "fp:encrypted-active",
      secret: "encrypted:new-secret",
      encryptedCodes: JSON.stringify(["ccccc-ddddd"]),
    });
  });

  test("a swap that found the attempt or the factor gone returns no codes", async () => {
    enrolled();
    world.conditionalWriteMatches = false;
    const { error, output } = await attempt(authenticated.confirmReplacement);
    expect(output).toBeUndefined();
    expect(error).toMatchObject({ reason: "CONFLICT", data: { code: "SETUP_REPLACED" } });
    expect(names()).not.toContain("adapter.refreshUserSessions");
  });

  test("a refresh that fails after the swap is partial and still returns the codes", async () => {
    enrolled();
    world.provider.refreshUserSessions = () => {
      throw new Error("redis down");
    };
    expect((await attempt(authenticated.confirmReplacement)).output).toMatchObject({
      status: "partial",
      recoveryCodes: ["ccccc-ddddd"],
      failedEffects: ["session-refresh"],
    });
  });
});

describe("disabling and recovery codes", () => {
  test("already off is unchanged, even where policy would refuse to turn it off", async () => {
    as({ twoFactorRequired: true, twoFactorEnabled: true });
    grant();
    world.factorEnabled = false;
    expect((await attempt(authenticated.disable)).output).toEqual({ status: "unchanged" });
    expect(names()).toEqual(["auth.api.verifyPassword", "findFactorAccount"]);
  });

  test("a required authenticator cannot be turned off; nothing is retired", async () => {
    as({ twoFactorRequired: true, twoFactorEnabled: true });
    grant();
    expect((await attempt(authenticated.disable)).error).toMatchObject({ reason: "FORBIDDEN", data: { reason: "enrollment-required" } });
    expect(names()).not.toContain("retirePendingSetups");
    expect(names()).not.toContain("auth.api.disableTwoFactor");
  });

  test("retires the staged setup before the provider removes the factor", async () => {
    as({ twoFactorEnabled: true });
    grant();
    expect((await attempt(authenticated.disable)).output).toEqual({ status: "completed" });
    expect(names().indexOf("retirePendingSetups")).toBeLessThan(names().indexOf("auth.api.disableTwoFactor"));
  });

  test("a thrown provider result counts when the factor is in fact off", async () => {
    as({ twoFactorEnabled: true });
    grant();
    world.provider.disableTwoFactor = () => {
      world.factorEnabled = false;
      throw new Error("session rotation failed");
    };
    expect((await attempt(authenticated.disable)).output).toEqual({ status: "completed" });

    grant();
    world.factorEnabled = null;
    world.provider.disableTwoFactor = () => {
      throw new Error("provider down");
    };
    expect((await attempt(authenticated.disable)).error.reason).toBe("INTERNAL");
  });

  test("new recovery codes need a verified factor, move the generation first and are returned once", async () => {
    expect((await attempt(authenticated.regenerate)).error).toMatchObject({ reason: "CONFLICT", data: { code: "INACTIVE" } });
    expect(names()).not.toContain("auth.api.generateBackupCodes");

    as({ twoFactorEnabled: true });
    grant();
    const { output } = await attempt(authenticated.regenerate);
    expect(output).toMatchObject({ status: "completed", recoveryCodes: ["aaaaa-bbbbb"] });
    expect(names().indexOf("advanceSecurityVersion")).toBeLessThan(names().indexOf("auth.api.generateBackupCodes"));
    // The codes are an output of the action and nothing else: they reach no log line.
    for (const level of ["log", "warn", "error"]) {
      expect(JSON.stringify(console[level].mock.calls)).not.toContain("aaaaa-bbbbb");
    }
  });
});

function sha256(value) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}
