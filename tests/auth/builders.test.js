import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { createHash } from "node:crypto";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { notFound, redirect } from "next/navigation";

// Mock only external boundaries; exercise the real builder, permissions and step-up.
const user = {
  id: "user-1",
  name: "Test",
  email: "test@example.com",
  emailVerified: true,
  role: "admin",
  twoFactorEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const session = {
  id: "session-1",
  userId: user.id,
  token: "token",
  impersonatedBy: null,
};
let resolved;
let stored;
const getSession = mock(async () => resolved);
const verifyTOTP = mock(async () => ({ token: session.token, user }));
const requestHeaders = new Headers({ cookie: "session=real" });
const redis = {
  eval: mock(async (_script, _keys, challenge, failure, hash, max) => {
    const count = Number(stored.get(failure) ?? 0);
    if (count >= max) return -1;
    if (stored.get(challenge) === hash) {
      stored.delete(challenge);
      stored.delete(failure);
      return 1;
    }
    stored.set(failure, String(count + 1));
    return count + 1 >= max ? -1 : 0;
  }),
  get: mock(async (key) => stored.get(key) ?? null),
  getdel: mock(async (key) => {
    const value = stored.get(key) ?? null;
    stored.delete(key);
    return value;
  }),
  mget: mock(async (...keys) => keys.map((key) => stored.get(key) ?? null)),
  set: mock(async (key, value, ...options) => {
    if (options.includes("NX") && stored.has(key)) return null;
    stored.set(key, value);
    return "OK";
  }),
  del: mock(async (key) => Number(stored.delete(key))),
};
const decrementIfExists = mock(async (key) => {
  if (!stored.has(key)) return 0;
  const value = Number(stored.get(key)) - 1;
  stored.set(key, String(value));
  return value;
});
const incrementWithTtl = mock(async (key) => {
  const count = Number(stored.get(key) ?? 0) + 1;
  stored.set(key, String(count));
  return count;
});
/** A grant in the current payload format, for the mock user's security generation. */
const grant = (verifiedAt = Date.now(), securityVersion = 0) => JSON.stringify({ verifiedAt, securityVersion });
/**
 * The session authority reads the current user row (and the step-up runtime
 * its security version) through the database; this minimal chain answers
 * both from the mock user, so the real authority code runs.
 */
const userTable = { name: "user" };
const rowsFor = () =>
  resolved
    ? [{ ...resolved.user, securityVersion: resolved.user.securityVersion ?? 0, sessionRevocationPending: false }]
    : [];
const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: async () => rowsFor(), for: async () => rowsFor() }),
    }),
  }),
};
mock.module("server-only", () => ({}));
mock.module("../../src/lib/db/index.ts", () => ({
  db: fakeDb,
  schema: {},
  user: userTable,
  emailChangeRequest: { name: "email_change_request" },
}));
mock.module("../../src/lib/auth/index.ts", () => ({
  auth: { api: { getSession, verifyTOTP } },
}));
mock.module("../../src/lib/redis/index.ts", () => ({
  redis,
  incrementWithTtl,
  decrementIfExists,
}));
const sendTwoFactorOtpEmail = mock(async () => {});
mock.module("../../src/lib/email/index.tsx", () => ({ sendTwoFactorOtpEmail }));
mock.module("next/headers", () => ({ headers: async () => requestHeaders }));

const { defineAction } =
  await import("../../src/lib/auth/builders/actionBuilder.ts");
const { toRouteHandler, toServerAction, assertMcpEligible } =
  await import("../../src/lib/auth/builders/adapters/index.ts");
const { Ctx } = await import("../../src/lib/auth/builders/context/index.ts");
const { ActionError } = await import("../../src/lib/auth/errors.ts");
const { sendStepUpEmail } = await import("../../src/lib/auth/stepUpActions.ts");
const { hasGrant } = await import("../../src/lib/auth/stepUp.ts");
const meta = {
  entryPoint: "server-action",
  headers: new Headers({
    "x-forwarded-for": "192.0.2.1, 192.0.2.2",
    "user-agent": "test",
  }),
};
const grantKey = "stepup:grant:user-1:session-1";
const failureKey = "stepup:fail:user-1:session-1";
let logs;

beforeEach(() => {
  resolved = { user: { ...user }, session: { ...session } };
  stored = new Map();
  for (const fn of [
    getSession,
    sendTwoFactorOtpEmail,
    verifyTOTP,
    incrementWithTtl,
    decrementIfExists,
    ...Object.values(redis),
  ])
    fn.mockClear();
  getSession.mockImplementation(async () => resolved);
  verifyTOTP.mockImplementation(async () => ({ token: session.token, user }));
  logs = [];
  for (const level of ["log", "warn", "error"])
    spyOn(console, level).mockImplementation((line) =>
      logs.push(JSON.parse(line)),
    );
});
afterEach(() => mock.restore());

function action(overrides = {}) {
  return defineAction({
    name: "test.action",
    handler: () => "done",
    ...overrides,
  });
}

function routeRequest(url, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", new URL(url).origin);
  return new Request(url, { ...init, headers });
}

async function denied(promise, reason) {
  await expect(promise).rejects.toMatchObject({ reason });
}

describe("action pipeline", () => {
  test("MCP exclusion is independent of step-up, and defaults to denied", async () => {
    for (const config of [{}, { mcpAllowed: false, stepUp: "none" }]) {
      const handler = mock(() => "done");
      const run = action({ ...config, handler });
      await expect(run(undefined, meta)).resolves.toBe("done");
      await denied(run(undefined, { ...meta, entryPoint: "mcp" }), "FORBIDDEN");
      expect(handler).toHaveBeenCalledTimes(1);
      expect(verifyTOTP).not.toHaveBeenCalled();
      expect(() => assertMcpEligible(run)).toThrow();
    }
  });

  test.each([
    { mcpAllowed: true, stepUp: "five_minutes" },
    { mcpAllowed: true, stepUp: "every_time" },
    { auth: "public", stepUp: "every_time" },
    { stepUp: "invalid" },
    { mcpAllowed: "true" },
  ])("invalid operation policy fails at definition time: %j", (config) => {
    expect(() => action(config)).toThrow();
  });

  test("public operations also need explicit MCP opt-in", async () => {
    await denied(action({ auth: "public" })(undefined, { ...meta, entryPoint: "mcp" }), "FORBIDDEN");
    await expect(action({ auth: "public", mcpAllowed: true })(undefined, { ...meta, entryPoint: "mcp" })).resolves.toBe("done");
  });

  test("grant reuse never extends expiry and old pool grants are ignored", async () => {
    const timestamp = grant(Date.now() - 299_000);
    stored.set(grantKey, timestamp);
    await action({ stepUp: "five_minutes" })(undefined, meta);
    expect(stored.get(grantKey)).toBe(timestamp);
    expect(redis.set).not.toHaveBeenCalled();
    stored.set(grantKey, grant(Date.now() - 300_000));
    await denied(action({ stepUp: "five_minutes" })(undefined, meta), "TWO_FACTOR_REQUIRED");
    stored.delete(grantKey);
    stored.set("stepup:lvl:user-1:session-1:3", String(Date.now()));
    await denied(action({ stepUp: "five_minutes" })(undefined, meta), "TWO_FACTOR_REQUIRED");
    // A legacy timestamp-only grant cannot prove its generation: refused.
    stored.set(grantKey, String(Date.now()));
    await denied(action({ stepUp: "five_minutes" })(undefined, meta), "TWO_FACTOR_REQUIRED");
    // A grant issued for an older security generation is refused as well.
    stored.set(grantKey, grant(Date.now(), 0));
    resolved.user.securityVersion = 1;
    await denied(action({ stepUp: "five_minutes" })(undefined, meta), "TWO_FACTOR_REQUIRED");
  });

  test("grant store failure refuses the operation", async () => {
    const handler = mock();
    redis.get.mockImplementationOnce(async () => { throw new Error("Redis unavailable"); });
    await denied(action({ stepUp: "five_minutes", handler })(undefined, meta), "INTERNAL");
    expect(handler).not.toHaveBeenCalled();
  });

  test.each(["mcp", undefined, "unknown"])("MCP-excluded operations deny unapproved provenance: %s", async (entryPoint) => {
    const handler = mock(() => "done");
    const auditLog = mock(() => "denied");
    const run = action({ mcpAllowed: false, stepUp: "five_minutes", handler, auditLog });
    stored.set("stepup:grant:user-1:session-1", grant());
    await denied(run(undefined, {
      ...meta, entryPoint, stepUp: { method: "totp", code: "123456" },
    }), "FORBIDDEN");
    expect(handler).not.toHaveBeenCalled();
    expect(verifyTOTP).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  test("step-up remains required despite admin permissions", async () => {
    const handler = mock(() => "done");
    const run = action({ mcpAllowed: false, stepUp: "five_minutes", handler });
    await denied(run(undefined, meta), "TWO_FACTOR_REQUIRED");
    expect(handler).not.toHaveBeenCalled();
    await expect(run(undefined, { ...meta, stepUp: { method: "totp", code: "123456" } })).resolves.toBe("done");
    expect(handler.mock.calls[0][0].stepUp).toBe("five_minutes");
  });

  test("step-up actions require verified email and reject impersonation", async () => {
    const run = action({ mcpAllowed: false, stepUp: "five_minutes" });
    resolved.user.emailVerified = false;
    await denied(run(undefined, meta), "EMAIL_VERIFICATION_REQUIRED");
    resolved.user.emailVerified = true;
    resolved.session.impersonatedBy = "other-admin";
    await denied(run(undefined, meta), "IMPERSONATION_FORBIDDEN");
  });

  test("MCP registration rejects definitions without opt-in and unclassified functions", async () => {
    for (const run of [action({ mcpAllowed: false, stepUp: "five_minutes" }), action({ stepUp: "five_minutes" }), async () => "unguarded"]) {
      expect(() => assertMcpEligible(run)).toThrow();
    }
    const read = action({ mcpAllowed: true });
    expect(() => assertMcpEligible(read)).not.toThrow();
    await expect(read(undefined, { ...meta, entryPoint: "mcp" })).resolves.toBe("done");
    const excluded = action({ mcpAllowed: false, stepUp: "five_minutes" });
    expect(Object.isFrozen(excluded)).toBe(true);
    expect(() => defineAction({ name: "invalid", auth: "public", mcpAllowed: false, stepUp: "five_minutes", handler: () => {} })).toThrow();
  });

  test("inline TOTP cannot authorize a second one-time action", async () => {
    const handler = mock(() => "done");
    const run = action({ stepUp: "every_time", handler });
    const proof = { ...meta, stepUp: { method: "totp", code: "123456" } };
    await run(undefined, proof);
    await denied(run(undefined, proof), "STEP_UP_INVALID_CODE");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(stored.has(grantKey)).toBe(false);
    expect(redis.set.mock.calls[0]).toEqual([
      expect.stringContaining("stepup:totp-used:user-1:"), "1", "EX", 90, "NX",
    ]);
  });

  test("only one concurrent inline TOTP request executes", async () => {
    const handler = mock(() => "done");
    const run = action({ stepUp: "every_time", handler });
    const proof = { ...meta, stepUp: { method: "totp", code: "123456" } };
    const results = await Promise.allSettled([
      run(undefined, proof), run(undefined, proof),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("TOTP cannot be replayed across policies or sessions; a fresh code works", async () => {
    const proof = { ...meta, stepUp: { method: "totp", code: "123456" } };
    await action({ stepUp: "five_minutes" })(undefined, proof);
    resolved.session.id = "session-2";
    const run = action({ stepUp: "every_time" });
    await denied(run(undefined, proof), "STEP_UP_INVALID_CODE");
    expect(await run(undefined, {
      ...meta, stepUp: { method: "totp", code: "654321" },
    })).toBe("done");
  });

  test("replay storage failure prevents the handler from running", async () => {
    const handler = mock();
    redis.set.mockImplementationOnce(async () => { throw new Error("Redis unavailable"); });
    await denied(action({ stepUp: "every_time", handler })(undefined, {
      ...meta, stepUp: { method: "totp", code: "123456" },
    }), "INTERNAL");
    expect(handler).not.toHaveBeenCalled();
  });

  test("public actions skip sessions and receive a branded anonymous context", async () => {
    getSession.mockImplementation(async () => {
      throw new Error("store unavailable");
    });
    const run = action({
      auth: "public",
      handler: (ctx, input) => {
        expect(Ctx.is(ctx)).toBe(true);
        expect(Ctx.is({ ...ctx })).toBe(false);
        expect(ctx.user).toBeNull();
        expect(ctx.session).toBeNull();
        expect(ctx.ip).toBe("192.0.2.1");
        expect(ctx.userAgent).toBe("test");
        expect(input).toBeUndefined();
        return "public";
      },
    });
    expect(await run({ ignored: true }, meta)).toBe("public");
    expect(getSession).not.toHaveBeenCalled();
    expect(logs.filter((entry) => entry.message === "action")).toHaveLength(1);
  });

  test("authentication precedes input parsing and anonymous refusals stay unrecorded", async () => {
    resolved = null;
    const parse = mock((value) => value);
    const handler = mock();
    const run = action({ schema: z.string().transform(parse), handler });
    await denied(run("payload", meta), "UNAUTHENTICATED");
    expect(parse).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  test("async schemas transform input before the handler", async () => {
    const run = action({
      schema: z.string().transform(async (value) => Number(value)),
      handler: (_, value) => value + 1,
    });
    expect(await run("41", meta)).toBe(42);
  });

  test("invalid input leaves grants and proofs untouched", async () => {
    stored.set(grantKey, grant());
    const handler = mock();
    const run = action({
      schema: z.object({ id: z.uuid() }),
      stepUp: "every_time",
      handler,
    });
    await denied(run({ id: "bad" }, meta), "INVALID_INPUT");
    expect(stored.has(grantKey)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  test.each([
    [{ session: { impersonatedBy: "admin" } }, "IMPERSONATION_FORBIDDEN"],
    [{ user: { emailVerified: false } }, "EMAIL_VERIFICATION_REQUIRED"],
    [{ user: { role: "user" } }, "FORBIDDEN"],
  ])("authorization refuses before step-up: %j", async (changes, reason) => {
    Object.assign(resolved.user, changes.user);
    Object.assign(resolved.session, changes.session);
    const auditLog = mock(() => "denied");
    const handler = mock();
    const run = action({
      permissions: "user.delete",
      stepUp: "five_minutes",
      auditLog,
      handler,
    });
    await denied(run(undefined, meta), reason);
    expect(handler).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(auditLog.mock.calls[0][0].stepUp).toBeNull();
    expect(auditLog.mock.calls[0][1]).toMatchObject({
      outcome: "denied",
      reason,
    });
  });

  test("permission connectors and optional permissions retain their behavior", async () => {
    resolved.user.role = "moderator";
    const permissions = ["user.ban", "user.delete"];
    await denied(action({ permissions })(undefined, meta), "FORBIDDEN");
    expect(
      await action({ permissions, permissionsConnector: "OR" })(
        undefined,
        meta,
      ),
    ).toBe("done");
    expect(await action({ permissions: [] })(undefined, meta)).toBe("done");
  });

  test("comma-separated roles are honoured by permissions and enrollment alike", async () => {
    resolved.user.role = "user,moderator";
    expect(await action({ permissions: "user.ban" })(undefined, meta)).toBe("done");

    // A multi-role staff account must still enroll an authenticator.
    resolved.user.twoFactorEnabled = false;
    await denied(action()(undefined, meta), "TWO_FACTOR_ENROLLMENT_REQUIRED");
    resolved.user.role = "user";
    expect(await action()(undefined, meta)).toBe("done");
  });

  test("a missing grant returns policy and available methods", async () => {
    await expect(
      action({ stepUp: "five_minutes" })(undefined, meta),
    ).rejects.toMatchObject({
      reason: "TWO_FACTOR_REQUIRED",
      status: 428,
      data: { policy: "five_minutes", methods: ["totp", "email"] },
    });
  });

  test("every-time operations ignore reusable grants without extending them", async () => {
    const timestamp = grant(Date.now() - 1000);
    stored.set(grantKey, timestamp);
    const handler = mock(() => "done");
    const run = action({ stepUp: "every_time", handler });
    await denied(run(undefined, meta), "TWO_FACTOR_REQUIRED");
    await run(undefined, { ...meta, stepUp: { method: "totp", code: "123456" } });
    expect(stored.get(grantKey)).toBe(timestamp);
    await denied(run(undefined, meta), "TWO_FACTOR_REQUIRED");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("inline one-time email proof is consumed without creating another grant", async () => {
    stored.set(
      "stepup:chal:user-1:session-1",
      createHash("sha256").update("123456").digest("hex"),
    );
    const auditLog = mock(async () => "verified");
    const run = action({ stepUp: "every_time", auditLog });
    expect(
      await run(undefined, {
        ...meta,
        stepUp: { method: "email", code: "123456" },
      }),
    ).toBe("done");
    expect(redis.set).not.toHaveBeenCalled();
    expect(auditLog.mock.calls[0][0].stepUp).toBe("every_time");
    await denied(run(undefined, meta), "TWO_FACTOR_REQUIRED");
  });

  test("email code survives a typo and succeeds only once", async () => {
    const key = "stepup:chal:user-1:session-1";
    const digest = createHash("sha256").update("123456").digest("hex");
    stored.set(key, digest);
    const handler = mock(() => "done");
    const run = action({ stepUp: "every_time", handler });
    await denied(
      run(undefined, { ...meta, stepUp: { method: "email", code: "000000" } }),
      "STEP_UP_INVALID_CODE",
    );
    expect(stored.get(key)).toBe(digest);
    expect(stored.get(failureKey)).toBe("1");
    expect(handler).not.toHaveBeenCalled();
    const results = await Promise.allSettled([
      run(undefined, { ...meta, stepUp: { method: "email", code: "123456" } }),
      run(undefined, { ...meta, stepUp: { method: "email", code: "123456" } }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(stored.has(key)).toBe(false);
  });

  test("five incorrect email codes lock verification without deleting the code", async () => {
    const key = "stepup:chal:user-1:session-1";
    stored.set(key, createHash("sha256").update("123456").digest("hex"));
    const run = action({ stepUp: "every_time" });
    for (let i = 0; i < 5; i++) {
      await denied(
        run(undefined, {
          ...meta,
          stepUp: { method: "email", code: "000000" },
        }),
        i === 4 ? "STEP_UP_LOCKED" : "STEP_UP_INVALID_CODE",
      );
    }
    await denied(
      run(undefined, { ...meta, stepUp: { method: "email", code: "123456" } }),
      "STEP_UP_LOCKED",
    );
    expect(stored.has(key)).toBe(true);
  });

  test("reusable grants last five minutes and remain session-bound", async () => {
    stored.set("stepup:grant:user-1:session-1", grant(Date.now() - 120_000));
    expect(
      await hasGrant({ userId: user.id, sessionId: session.id }, 0),
    ).toBe(true);
    expect(
      await hasGrant({ userId: user.id, sessionId: session.id }, 0),
    ).toBe(true);
    stored.set("stepup:grant:user-1:session-1", grant(Date.now() - 301_000));
    expect(await hasGrant({ userId: user.id, sessionId: session.id }, 0)).toBe(false);
    expect(
      await hasGrant({ userId: user.id, sessionId: "other" }, 0),
    ).toBe(false);
    stored.set("stepup:grant:user-1:session-1", grant(Date.now() + 60_000));
    expect(
      await hasGrant({ userId: user.id, sessionId: session.id }, 0),
    ).toBe(false);
  });

  test.each([
    null,
    false,
    {},
    { method: "sms", code: "123456" },
    { method: "totp", code: 123456 },
  ])(
    "malformed proofs cannot fall back to an existing grant: %j",
    async (stepUp) => {
      stored.set(grantKey, grant());
      await denied(
        action({ stepUp: "every_time" })(undefined, { ...meta, stepUp }),
        "INVALID_INPUT",
      );
      expect(stored.has(grantKey)).toBe(true);
      expect(verifyTOTP).not.toHaveBeenCalled();
    },
  );

  test("TOTP rejection spends an attempt even if a grant already exists", async () => {
    stored.set(grantKey, grant());
    verifyTOTP.mockImplementation(async () => {
      throw new APIError("UNAUTHORIZED", { code: "INVALID_CODE" });
    });
    await denied(
      action({ stepUp: "every_time" })(undefined, {
        ...meta,
        stepUp: { method: "totp", code: "123456" },
      }),
      "STEP_UP_INVALID_CODE",
    );
    expect(incrementWithTtl).toHaveBeenCalledTimes(1);
    expect(stored.has(grantKey)).toBe(true);
  });

  test("TOTP infrastructure failures do not spend the attempt budget", async () => {
    verifyTOTP.mockImplementation(async () => {
      throw new Error("database unavailable");
    });
    await denied(
      action({ stepUp: "five_minutes" })(undefined, {
        ...meta,
        stepUp: { method: "totp", code: "123456" },
      }),
      "INTERNAL",
    );
    expect(Number(stored.get(failureKey) ?? 0)).toBe(0);
    expect(redis.set).not.toHaveBeenCalled();
  });

  test("a TOTP attempt is charged before Better Auth is asked, so concurrent guesses cannot outrun the budget", async () => {
    let chargedWhenAsked;
    verifyTOTP.mockImplementation(async () => {
      chargedWhenAsked = Number(stored.get(failureKey));
      throw new APIError("UNAUTHORIZED", { code: "INVALID_CODE" });
    });
    await denied(
      action({ stepUp: "five_minutes" })(undefined, {
        ...meta,
        stepUp: { method: "totp", code: "123456" },
      }),
      "STEP_UP_INVALID_CODE",
    );
    expect(chargedWhenAsked).toBe(1);
    expect(stored.get(failureKey)).toBe("1");
  });

  test("locked sessions never verify a proof", async () => {
    stored.set(failureKey, "5");
    await denied(
      action({ stepUp: "five_minutes" })(undefined, {
        ...meta,
        stepUp: { method: "totp", code: "123456" },
      }),
      "STEP_UP_LOCKED",
    );
    expect(verifyTOTP).not.toHaveBeenCalled();
  });

  test("successful reusable proofs persist the appropriate TTL and clear failures", async () => {
    stored.set(failureKey, "2");
    expect(
      await action({ stepUp: "five_minutes" })(undefined, {
        ...meta,
        stepUp: { method: "totp", code: "123456" },
      }),
    ).toBe("done");
    expect(stored.has(failureKey)).toBe(false);
    expect(redis.set.mock.calls.find(([key]) => key === "stepup:grant:user-1:session-1")).toEqual([
      "stepup:grant:user-1:session-1",
      expect.any(String),
      "EX",
      300,
    ]);
    expect(verifyTOTP.mock.calls[0][0].headers).toBe(meta.headers);
  });

  test.each([null, undefined])(
    "failed handlers audit valid %j input and hide internal details",
    async (input) => {
      const auditLog = mock(() => "failure");
      const run = action({
        schema: z.unknown(),
        auditLog,
        handler: () => {
          throw new Error("service context", {
            cause: new Error("secret database details"),
          });
        },
      });
      await expect(run(input, meta)).rejects.toMatchObject({
        reason: "INTERNAL",
        message: "INTERNAL",
      });
      expect(auditLog.mock.calls[0][1]).toEqual({ outcome: "failed", input });
      const failure = logs.find(
        (entry) => entry.outcome === "failed" && entry.level === "error",
      );
      // The log keeps the whole cause chain; the client response keeps none of it.
      expect(failure.error).toContain("service context");
      expect(failure.error).toContain("Caused by: Error: secret database details");
    },
  );

  test("an explicit INTERNAL error is a failure with a sanitized client response", async () => {
    const run = action({
      handler: () => {
        throw new ActionError("INTERNAL", {
          message: "secret",
          data: "secret",
        });
      },
    });
    const result = await toServerAction(run)(undefined);
    expect(result).toEqual({
      ok: false,
      reason: "INTERNAL",
      status: 500,
      message: "INTERNAL",
    });
    expect(logs.some((entry) => entry.outcome === "failed")).toBe(true);
  });

  test("audit hook failure cannot fail a completed action", async () => {
    expect(
      await action({
        auditLog: async () => {
          throw new Error("audit unavailable");
        },
      })(undefined, meta),
    ).toBe("done");
    expect(logs.some((entry) => entry.message === "audit hook threw")).toBe(
      true,
    );
  });

  test.each([() => redirect("/login"), () => notFound()])(
    "Next control-flow errors propagate unchanged",
    async (handler) => {
      const run = action({ handler });
      await expect(run(undefined, meta)).rejects.toHaveProperty("digest");
      expect(logs).toEqual([]);
    },
  );
});

describe("enrolled-only step-up condition", () => {
  test.each([
    { stepUp: "none", stepUpWhen: "two_factor_enabled" },
    { mcpAllowed: true, stepUpWhen: "two_factor_enabled" },
    { auth: "public", stepUpWhen: "two_factor_enabled" },
    { stepUp: "five_minutes", stepUpWhen: "sometimes" },
  ])("a condition needs an authenticated, MCP-disabled step-up operation: %j", (config) => {
    expect(() => action(config)).toThrow();
  });

  test("an enrolled account is verified exactly as with an unconditional policy", async () => {
    const handler = mock(() => "done");
    const run = action({ stepUp: "five_minutes", stepUpWhen: "two_factor_enabled", handler });
    await denied(run(undefined, meta), "TWO_FACTOR_REQUIRED");
    stored.set(grantKey, grant());
    expect(await run(undefined, meta)).toBe("done");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("without an authenticator the effective policy is none: no prompt, no grant, unverified email allowed", async () => {
    resolved.user = { ...resolved.user, role: "user", twoFactorEnabled: false, emailVerified: false };
    const handler = mock(() => "done");
    const run = action({ stepUp: "five_minutes", stepUpWhen: "two_factor_enabled", handler });
    expect(await run(undefined, meta)).toBe("done");
    expect(stored.has(grantKey)).toBe(false);
    expect(handler.mock.calls[0][0].stepUp).toBeNull();
    // An explicit verified-email requirement still applies on its own.
    await denied(
      action({ stepUp: "five_minutes", stepUpWhen: "two_factor_enabled", requireVerifiedEmail: true })(undefined, meta),
      "EMAIL_VERIFICATION_REQUIRED",
    );
  });

  test("a stale proof for a condition that no longer holds is refused, not turned into a grant", async () => {
    resolved.user = { ...resolved.user, role: "user", twoFactorEnabled: false };
    const handler = mock(() => "done");
    const run = action({ stepUp: "five_minutes", stepUpWhen: "two_factor_enabled", handler });
    await denied(run(undefined, { ...meta, stepUp: { method: "totp", code: "123456" } }), "INVALID_INPUT");
    expect(verifyTOTP).not.toHaveBeenCalled();
    expect(stored.has(grantKey)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    // The plain resubmission proceeds.
    expect(await run(undefined, meta)).toBe("done");
  });

  test("a security-version change during verification refuses the proof instead of relabelling it", async () => {
    verifyTOTP.mockImplementation(async () => {
      resolved.user.securityVersion = 7;
      return { token: session.token, user };
    });
    const run = action({ stepUp: "five_minutes" });
    await denied(run(undefined, { ...meta, stepUp: { method: "totp", code: "123456" } }), "CONFLICT");
    expect(stored.has(grantKey)).toBe(false);
  });

  test("grants record the generation they were verified against", async () => {
    resolved.user.securityVersion = 3;
    const run = action({ stepUp: "five_minutes" });
    await run(undefined, { ...meta, stepUp: { method: "totp", code: "123456" } });
    expect(JSON.parse(stored.get(grantKey))).toMatchObject({ securityVersion: 3 });
    expect(await run(undefined, meta)).toBe("done");
    resolved.user.securityVersion = 4;
    await denied(run(undefined, meta), "TWO_FACTOR_REQUIRED");
  });
});

describe("transport adapters", () => {
  test("server action copies only step-up and sets trusted provenance", async () => {
    const proof = { method: "totp", code: "123456" };
    const run = mock(async (_input, received) => {
      expect(received).toEqual({ headers: requestHeaders, entryPoint: "server-action", stepUp: proof });
    });
    await toServerAction(run)(undefined, {
      stepUp: proof, entryPoint: "mcp", headers: "forged", role: "admin", mcpAllowed: true,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("route adapter sets provenance independently of JSON input", async () => {
    const run = mock(async (_input, received) => {
      expect(received.entryPoint).toBe("route-handler");
      expect(received.mcpAllowed).toBeUndefined();
    });
    await toRouteHandler(run)(routeRequest("https://example.com", {
      method: "POST", body: JSON.stringify({ entryPoint: "mcp", mcpAllowed: true }),
    }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, "null", "https://untrusted.example.com", "https://evil.test"])(
    "unsafe requests reject untrusted or missing origin: %s", async (origin) => {
      const handler = mock(() => "changed");
      const run = toRouteHandler(action({ handler }));
      const headers = new Headers({ "content-type": "text/plain", cookie: "session=real" });
      if (origin !== undefined) headers.set("origin", origin);
      const response = await run(new Request("https://app.example.com/change", {
        method: "POST", headers, body: "{}",
      }));
      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
      expect(getSession).not.toHaveBeenCalled();
    },
  );

  test.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s allows the exact origin and rejects forwarded-host spoofing", async (method) => {
      const run = mock(async () => "done");
      const route = toRouteHandler(run);
      expect((await route(routeRequest("https://app.example.com/change", { method }))).status).toBe(200);
      const rejected = await route(routeRequest("https://app.example.com/change", {
        method, headers: { origin: "https://evil.test", "x-forwarded-host": "evil.test" },
      }));
      expect(rejected.status).toBe(403);
      expect(run).toHaveBeenCalledTimes(1);
    },
  );

  test("server actions use request headers and preserve denial metadata", async () => {
    const run = mock(async (_, meta) => {
      expect(meta.headers).toBe(requestHeaders);
      throw ActionError.twoFactorRequired({
        policy: "five_minutes",
        methods: ["email"],
      });
    });
    const result = await toServerAction(run)(undefined, {
      headers: new Headers({ cookie: "fake" }),
    });
    expect(result).toMatchObject({
      ok: false,
      status: 428,
      reason: "TWO_FACTOR_REQUIRED",
      data: { policy: "five_minutes", methods: ["email"] },
    });
  });

  test.each(
    [null, 42, "hello", [1, 2], { id: "item" }].map((input) => [input]),
  )("JSON input survives the route boundary: %j", async (input) => {
    const run = mock(async (value) => value);
    const response = await toRouteHandler(run)(
      routeRequest("https://example.com", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
    expect(await response.json()).toEqual({ data: input });
    expect(run.mock.calls[0][0]).toEqual(input);
  });

  test("malformed JSON is a 400 and never reaches the action", async () => {
    const run = mock();
    const response = await toRouteHandler(run)(
      routeRequest("https://example.com", { method: "POST", body: "{" }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.reason).toBe("INVALID_INPUT");
    expect(run).not.toHaveBeenCalled();
  });

  test.each(["GET", "HEAD", "POST"])(
    "bodyless %s uses undefined input",
    async (method) => {
      const run = mock(async () => "done");
      await toRouteHandler(run)(routeRequest("https://example.com", { method }));
      expect(run.mock.calls[0][0]).toBeUndefined();
    },
  );

  test("stepUp is removed from object input and checked even when null", async () => {
    const run = action({
      schema: z.object({ id: z.string() }).strict(),
      stepUp: "five_minutes",
    });
    const response = await toRouteHandler(run)(
      routeRequest("https://example.com", {
        method: "POST",
        body: JSON.stringify({ id: "item", stepUp: null }),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.reason).toBe("INVALID_INPUT");
  });

  test("route refusals carry their HTTP status and payload", async () => {
    const response = await toRouteHandler(action({ stepUp: "five_minutes" }))(
      routeRequest("https://example.com"),
    );
    expect(response.status).toBe(428);
    expect((await response.json()).error.data).toEqual({
      policy: "five_minutes",
      methods: ["totp", "email"],
    });
  });
});


describe("email challenge action", () => {
  test("requires a session and verified email before sending", async () => {
    resolved = null;
    expect((await sendStepUpEmail()).reason).toBe("UNAUTHENTICATED");
    resolved = { user: { ...user, emailVerified: false }, session };
    expect((await sendStepUpEmail()).reason).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(sendTwoFactorOtpEmail).not.toHaveBeenCalled();
  });

  test("throttles repeat sends without resetting the failed-attempt budget", async () => {
    stored.set(failureKey, "2");
    const response = await sendStepUpEmail();
    expect(response.ok).toBe(true);
    const challenge = stored.get("stepup:chal:user-1:session-1");
    expect((await sendStepUpEmail()).reason).toBe("RATE_LIMITED");
    expect(sendTwoFactorOtpEmail).toHaveBeenCalledTimes(1);
    expect(stored.get(failureKey)).toBe("2");
    expect(stored.get("stepup:chal:user-1:session-1")).toBe(challenge);
    stored.delete("stepup:send:user-1:session-1");
    expect((await sendStepUpEmail()).ok).toBe(true);
    expect(sendTwoFactorOtpEmail).toHaveBeenCalledTimes(2);
    expect(stored.get(failureKey)).toBe("2");
  });
});

test("unenrolled staff cannot invoke protected operations through any transport", async () => {
  resolved = { user: { ...user, twoFactorEnabled: false }, session };
  const operation = defineAction({ name: "test.session", mcpAllowed: true, handler: async () => "allowed" });
  for (const entryPoint of ["server-action", "route-handler", "mcp"]) {
    await expect(operation(undefined, { ...meta, entryPoint })).rejects.toMatchObject({ reason: "TWO_FACTOR_ENROLLMENT_REQUIRED" });
  }
  expect(getSession).toHaveBeenCalledWith({
    headers: meta.headers,
    query: { disableCookieCache: true },
  });
  resolved.user.role = "user";
  expect(await operation(undefined, meta)).toBe("allowed");
});
