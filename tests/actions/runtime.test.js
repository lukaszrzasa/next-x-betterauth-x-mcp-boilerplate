import { describe, expect, mock, test } from "bun:test";
import { createActionRuntime } from "../../src/lib/actions/actionRuntime";

const required = {
  ok: false,
  reason: "TWO_FACTOR_REQUIRED",
  status: 428,
  message: "Verify",
  data: { policy: "five_minutes", methods: ["email"] },
};
const invalid = {
  ok: false,
  reason: "STEP_UP_INVALID_CODE",
  status: 401,
  message: "Wrong code",
};
const success = { ok: true, data: "saved" };
const proof = { method: "email", code: "123456" };
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const signal = () => new AbortController().signal;

function runtime(present) {
  return createActionRuntime({
    presentVerification: present,
    sendEmail: async () => ({ ok: true, data: undefined }),
  });
}

describe("action lifecycle", () => {
  test("returns success without opening a modal", async () => {
    const present = mock();
    expect(
      await runtime(present).execute(async () => success, {}, signal()),
    ).toEqual({ status: "success", data: "saved" });
    expect(present).not.toHaveBeenCalled();
  });

  test("retries only with submitted proof and keeps invalid-code feedback local", async () => {
    const action = mock(async (_, meta) => {
      if (!meta) return required;
      return meta.stepUp.code === "000000" ? invalid : success;
    });
    const present = mock(async (request) => {
      expect(await request.submit({ ...proof, code: "000000" })).toEqual(
        invalid,
      );
      expect(await request.submit(proof)).toBeNull();
      return "finished";
    });
    expect(await runtime(present).execute(action, { id: 1 }, signal())).toEqual(
      { status: "success", data: "saved" },
    );
    expect(action.mock.calls).toEqual([
      [{ id: 1 }],
      [{ id: 1 }, { stepUp: { ...proof, code: "000000" } }],
      [{ id: 1 }, { stepUp: proof }],
    ]);
    expect(present).toHaveBeenCalledTimes(1);
  });

  test("queued actions recheck their own grant instead of sharing a code", async () => {
    const opened = deferred();
    const proceed = deferred();
    let grant = false;
    const first = mock(async (_, meta) => {
      if (!meta) return required;
      grant = true;
      return success;
    });
    const second = mock(async () => (grant ? success : required));
    const present = mock(async (request) => {
      opened.resolve();
      await proceed.promise;
      await request.submit(proof);
      return "finished";
    });
    const rt = runtime(present);
    const a = rt.execute(first, 1, signal());
    await opened.promise;
    const b = rt.execute(second, 2, signal());
    await tick();
    proceed.resolve();
    expect((await a).status).toBe("success");
    expect((await b).status).toBe("success");
    expect(present).toHaveBeenCalledTimes(1);
    expect(second.mock.calls).toEqual([[2], [2]]);
  });

  test("a cancelled queued action settles immediately and never retries", async () => {
    const hold = deferred();
    const opened = deferred();
    const rt = runtime(async () => {
      opened.resolve();
      await hold.promise;
      return "cancelled";
    });
    const a = rt.execute(async () => required, 1, signal());
    await opened.promise;
    const abort = new AbortController();
    const action = mock(async () => required);
    const b = rt.execute(action, 2, abort.signal);
    await tick();
    abort.abort();
    expect(await b).toEqual({ status: "cancelled" });
    hold.resolve();
    await a;
    await tick();
    expect(action).toHaveBeenCalledTimes(1);
  });

  test("cancellation holds the verification slot until an in-flight send settles", async () => {
    const sending = deferred();
    const started = deferred();
    const abort = new AbortController();
    let calls = 0;
    const present = mock(async (request) => {
      if (++calls === 1) {
        void request.sendEmail();
        started.resolve();
        await new Promise((resolve) =>
          request.signal.addEventListener("abort", resolve, { once: true }),
        );
      }
      return "cancelled";
    });
    const rt = createActionRuntime({
      presentVerification: present,
      sendEmail: () => sending.promise,
    });
    const a = rt.execute(async () => required, 1, abort.signal);
    await started.promise;
    const b = rt.execute(async () => required, 2, signal());
    await tick();
    abort.abort();
    expect(await a).toEqual({ status: "cancelled" });
    await tick();
    expect(present).toHaveBeenCalledTimes(1);
    sending.resolve({ ok: true });
    await b;
    expect(present).toHaveBeenCalledTimes(2);
  });

  test.each(["INTERNAL", "STEP_UP_LOCKED", "UNAUTHENTICATED"])(
    "%s after proof is terminal",
    async (reason) => {
      const failure = { ok: false, reason, status: 500, message: reason };
      const action = mock(async (_, meta) => (meta ? failure : required));
      const rt = runtime(async (request) => {
        expect(await request.submit(proof)).toBeNull();
        return "finished";
      });
      expect(await rt.execute(action, 1, signal())).toEqual({
        status: "error",
        error: failure,
      });
      expect(action).toHaveBeenCalledTimes(2);
    },
  );

  test("transport failures do not trigger a retry", async () => {
    const action = mock(async () => {
      throw new Error("connection lost");
    });
    const result = await runtime(mock()).execute(action, 1, signal());
    expect(result.status).toBe("error");
    expect(result.error.reason).toBe("TRANSPORT");
    expect(action).toHaveBeenCalledTimes(1);
  });

  test("malformed challenge data is terminal", async () => {
    const present = mock();
    const result = await runtime(present).execute(
      async () => ({ ...required, data: { methods: [] } }),
      1,
      signal(),
    );
    expect(result.error.reason).toBe("INTERNAL");
    expect(present).not.toHaveBeenCalled();
  });

  test("resend throttling remains in the dialog", async () => {
    const limited = {
      ok: false,
      reason: "RATE_LIMITED",
      status: 429,
      message: "Wait",
    };
    const rt = createActionRuntime({
      sendEmail: async () => limited,
      presentVerification: async (request) => {
        expect(await request.sendEmail()).toEqual(limited);
        await request.submit(proof);
        return "finished";
      },
    });
    expect(
      (
        await rt.execute(
          async (_, meta) => (meta ? success : required),
          1,
          signal(),
        )
      ).status,
    ).toBe("success");
  });
});

test("framework control flow closes verification and releases the queue", async () => {
  const { redirect } = await import("next/navigation");
  const action = mock(async (_, meta) => {
    if (meta) redirect("/done");
    return required;
  });
  const rt = runtime(async (request) => {
    const cancelled = new Promise((resolve) =>
      request.signal.addEventListener("abort", () => resolve("cancelled"), {
        once: true,
      }),
    );
    await request.submit(proof);
    return cancelled;
  });
  await expect(rt.execute(action, 1, signal())).rejects.toMatchObject({
    message: "NEXT_REDIRECT",
  });
  expect((await rt.execute(async () => success, 2, signal())).status).toBe(
    "success",
  );
});
