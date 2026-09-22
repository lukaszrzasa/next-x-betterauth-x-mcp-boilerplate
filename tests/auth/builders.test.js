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
const incrementWithTtl = mock(async (key) => {
  const count = Number(stored.get(key) ?? 0) + 1;
  stored.set(key, String(count));
  return count;
});
mock.module("server-only", () => ({}));
mock.module("../../src/lib/auth/index.ts", () => ({
  auth: { api: { getSession, verifyTOTP } },
}));
mock.module("../../src/lib/redis/index.ts", () => ({
  redis,
  incrementWithTtl,
}));
mock.module("../../src/lib/email/index.ts", () => ({
  sendTwoFactorOtpEmail: mock(async () => {}),
}));
mock.module("next/headers", () => ({ headers: async () => requestHeaders }));

const { defineAction } =
  await import("../../src/lib/auth/builders/actionBuilder.ts");
const { toRouteHandler, toServerAction } =
  await import("../../src/lib/auth/builders/adapters/index.ts");
const { Ctx } = await import("../../src/lib/auth/builders/context/index.ts");
const { ActionError } = await import("../../src/lib/auth/errors.ts");
const { hasGrant } = await import("../../src/lib/auth/stepUp.ts");
const meta = {
  headers: new Headers({
    "x-forwarded-for": "192.0.2.1, 192.0.2.2",
    "user-agent": "test",
  }),
};
const grantKey = "stepup:once:user-1:session-1:one_time";
const failureKey = "stepup:fail:user-1:session-1";
let logs;

beforeEach(() => {
  resolved = { user: { ...user }, session: { ...session } };
  stored = new Map();
  for (const fn of [
    getSession,
    verifyTOTP,
    incrementWithTtl,
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
  test("inline TOTP cannot authorize a second one-time action", async () => {
    const handler = mock(() => "done");
    const run = action({ twoFactorPool: "one_time", handler });
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
    const run = action({ twoFactorPool: "one_time", handler });
    const proof = { ...meta, stepUp: { method: "totp", code: "123456" } };
    const results = await Promise.allSettled([
      run(undefined, proof), run(undefined, proof),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("TOTP cannot be replayed across pools or sessions; a fresh code works", async () => {
    const proof = { ...meta, stepUp: { method: "totp", code: "123456" } };
    await action({ twoFactorPool: "sensitive" })(undefined, proof);
    resolved.session.id = "session-2";
    const run = action({ twoFactorPool: "one_time" });
    await denied(run(undefined, proof), "STEP_UP_INVALID_CODE");
    expect(await run(undefined, {
      ...meta, stepUp: { method: "totp", code: "654321" },
    })).toBe("done");
  });

  test("replay storage failure prevents the handler from running", async () => {
    const handler = mock();
    redis.set.mockImplementationOnce(async () => { throw new Error("Redis unavailable"); });
    await denied(action({ twoFactorPool: "one_time", handler })(undefined, {
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

  test("invalid input cannot consume a one-time grant", async () => {
    stored.set(grantKey, String(Date.now()));
    const handler = mock();
    const run = action({
      schema: z.object({ id: z.uuid() }),
      twoFactorPool: "one_time",
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
      twoFactorPool: "sensitive",
      auditLog,
      handler,
    });
    await denied(run(undefined, meta), reason);
    expect(handler).not.toHaveBeenCalled();
    expect(redis.mget).not.toHaveBeenCalled();
    expect(auditLog.mock.calls[0][0].twoFactorPool).toBeNull();
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

  test("a missing grant returns pool and available methods", async () => {
    await expect(
      action({ twoFactorPool: "sensitive" })(undefined, meta),
    ).rejects.toMatchObject({
      reason: "TWO_FACTOR_REQUIRED",
      status: 428,
      data: { pool: "sensitive", methods: ["totp", "email"] },
    });
  });

  test("only one concurrent request can spend a one-time grant", async () => {
    stored.set(grantKey, String(Date.now()));
    const handler = mock((ctx) => ctx.twoFactorPool);
    const run = action({ twoFactorPool: "one_time", handler });
    const results = await Promise.allSettled([
      run(undefined, meta),
      run(undefined, meta),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].twoFactorPool).toBe("one_time");
  });

  test("inline one-time email proof is consumed without creating another grant", async () => {
    stored.set(
      "stepup:chal:user-1:session-1",
      createHash("sha256").update("123456").digest("hex"),
    );
    const auditLog = mock(async () => "verified");
    const run = action({ twoFactorPool: "one_time", auditLog });
    expect(
      await run(undefined, {
        ...meta,
        stepUp: { method: "email", code: "123456" },
      }),
    ).toBe("done");
    expect(redis.set).not.toHaveBeenCalled();
    expect(auditLog.mock.calls[0][0].twoFactorPool).toBe("one_time");
    await denied(run(undefined, meta), "TWO_FACTOR_REQUIRED");
  });

  test("higher-importance grants satisfy lower pools within their own windows", async () => {
    stored.set("stepup:lvl:user-1:session-1:3", String(Date.now() - 120_000));
    expect(
      await hasGrant({ userId: user.id, sessionId: session.id }, "default"),
    ).toBe(true);
    expect(
      await hasGrant({ userId: user.id, sessionId: session.id }, "sensitive"),
    ).toBe(false);
    expect(
      await hasGrant({ userId: user.id, sessionId: "other" }, "default"),
    ).toBe(false);
    stored.set("stepup:lvl:user-1:session-1:3", String(Date.now() + 60_000));
    expect(
      await hasGrant({ userId: user.id, sessionId: session.id }, "default"),
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
      stored.set(grantKey, String(Date.now()));
      await denied(
        action({ twoFactorPool: "one_time" })(undefined, { ...meta, stepUp }),
        "INVALID_INPUT",
      );
      expect(stored.has(grantKey)).toBe(true);
      expect(verifyTOTP).not.toHaveBeenCalled();
    },
  );

  test("TOTP rejection spends an attempt even if a grant already exists", async () => {
    stored.set(grantKey, String(Date.now()));
    verifyTOTP.mockImplementation(async () => {
      throw new APIError("UNAUTHORIZED", { code: "INVALID_CODE" });
    });
    await denied(
      action({ twoFactorPool: "one_time" })(undefined, {
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
      action({ twoFactorPool: "sensitive" })(undefined, {
        ...meta,
        stepUp: { method: "totp", code: "123456" },
      }),
      "INTERNAL",
    );
    expect(incrementWithTtl).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  test("locked sessions never verify a proof", async () => {
    stored.set(failureKey, "5");
    await denied(
      action({ twoFactorPool: "sensitive" })(undefined, {
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
      await action({ twoFactorPool: "sensitive" })(undefined, {
        ...meta,
        stepUp: { method: "totp", code: "123456" },
      }),
    ).toBe("done");
    expect(stored.has(failureKey)).toBe(false);
    expect(redis.set.mock.calls.find(([key]) => key === "stepup:lvl:user-1:session-1:3")).toEqual([
      "stepup:lvl:user-1:session-1:3",
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
          throw new Error("secret database details");
        },
      });
      await expect(run(input, meta)).rejects.toMatchObject({
        reason: "INTERNAL",
        message: "INTERNAL",
      });
      expect(auditLog.mock.calls[0][1]).toEqual({ outcome: "failed", input });
      expect(
        logs.some(
          (entry) => entry.outcome === "failed" && entry.level === "error",
        ),
      ).toBe(true);
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

describe("transport adapters", () => {
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
        pool: "default",
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
      data: { pool: "default", methods: ["email"] },
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
      twoFactorPool: "sensitive",
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
    const response = await toRouteHandler(action({ twoFactorPool: "default" }))(
      routeRequest("https://example.com"),
    );
    expect(response.status).toBe(428);
    expect((await response.json()).error.data).toEqual({
      pool: "default",
      methods: ["totp", "email"],
    });
  });
});
