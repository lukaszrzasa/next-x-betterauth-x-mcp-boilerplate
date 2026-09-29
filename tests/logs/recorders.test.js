import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * The three recorders with their persistence mocked, so the operations
 * themselves run: what is prepared and in which order, what reaches
 * persistence (and that nothing does for a refused record), how the facts
 * persistence returns are interpreted, and the error each caller gets. The
 * SQL, the constraints and the races run against PostgreSQL in the
 * integration suite.
 */

const calls = [];
const step = (name, answer) =>
  mock(async (...args) => {
    calls.push(name);
    return answer(...args);
  });
const world = {};

const insertStaffLog = step("insertStaffLog", (ctx, entry) => world.insertStaffLog(ctx, entry));
const insertInitialAttempt = step("insertInitialAttempt", (ctx, attempt) => world.insertInitialAttempt(ctx, attempt));
const findAttemptByRecordKey = step("findAttemptByRecordKey", (ctx, key) => world.findAttemptByRecordKey(ctx, key));
const findCompletionState = step("findCompletionState", (ctx, id) => world.findCompletionState(ctx, id));
const tryCompleteAttempt = step("tryCompleteAttempt", (ctx, completion, from) => world.tryCompleteAttempt(ctx, completion, from));
const chain = {
  findByRecordKey: step("chain.findByRecordKey", (key) => world.chain.findByRecordKey(key)),
  findPredecessor: step("chain.findPredecessor", (id) => world.chain.findPredecessor(id)),
  lockOriginal: step("chain.lockOriginal", (id) => world.chain.lockOriginal(id)),
  findLatestAttempt: step("chain.findLatestAttempt", (id) => world.chain.findLatestAttempt(id)),
  insertRetry: step("chain.insertRetry", (attempt, position) => world.chain.insertRetry(attempt, position)),
};
const withRetryChain = step("withRetryChain", (ctx, decide) => decide(chain));
const persistence = [insertStaffLog, insertInitialAttempt, findAttemptByRecordKey, findCompletionState, tryCompleteAttempt, withRetryChain, ...Object.values(chain)];

mock.module("server-only", () => ({}));
const DB = "../../app/(LogsModule)/_/db";
mock.module("../../app/(LogsModule)/admin/_/db/staff/insertStaffLog.ts", () => ({ insertStaffLog }));
mock.module(`${DB}/email/insertAttempt.ts`, () => ({ insertInitialAttempt }));
mock.module(`${DB}/email/findAttempt.ts`, () => ({ findAttemptByRecordKey, findCompletionState }));
mock.module(`${DB}/email/retryTransaction.ts`, () => ({ withRetryChain }));
mock.module(`${DB}/email/completeAttempt.ts`, () => ({ tryCompleteAttempt }));

const { loadLogRecorders } = await import("../helpers/logOperations.js");
const { recordStaffLog, beginEmailLog, completeEmailLog } = await loadLogRecorders();
const { StaffLogError } = await import("../../app/(LogsModule)/_/staffLog/types.ts");
const { LogRecordingError } = await import("../../app/(LogsModule)/_/types.ts");
const { canonicalJson, sha256Hex } = await import("../../app/(LogsModule)/_/derivation.ts");
const { REDACTED } = await import("../../app/(LogsModule)/_/redaction.ts");
const { text, user } = await import("../../app/(LogsModule)/_/staffLog/blocks.ts");

const ada = { user: { id: "user-ada", name: "Ada Lovelace" }, requestId: "req-1" };
const anonymous = { user: null, requestId: "req-public" };
const LOG_ID = "01900000-0000-7000-8000-000000000001";
const ORIGINAL_ID = "01900000-0000-7000-8000-000000000000";
const NEW_ID = "01900000-0000-7000-8000-0000000000ff";

const failure = async (promise) => {
  const error = await promise.then(
    () => undefined,
    (caught) => caught,
  );
  expect(error).toBeDefined();
  return error;
};
/** A recorder's only error: a fixed message, paths and codes, and nothing of what caused it. */
async function refusal(promise, code) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(LogRecordingError);
  expect(error.code).toBe(code);
  expect(error.cause).toBeUndefined();
  return error;
}
const nothingReached = () => {
  for (const fn of persistence) expect(fn).not.toHaveBeenCalled();
};

beforeEach(() => {
  calls.length = 0;
  for (const fn of persistence) fn.mockClear();
  world.insertStaffLog = async () => {};
  world.insertInitialAttempt = async () => NEW_ID;
  world.findAttemptByRecordKey = async () => null;
  world.findCompletionState = async () => null;
  world.tryCompleteAttempt = async (ctx, completion) => completion.id;
  world.chain = {
    findByRecordKey: async () => null,
    findPredecessor: async (id) => ({ id, originalLogId: ORIGINAL_ID }),
    lockOriginal: async () => ({ recipientEmail: "alice@example.test", recipientUserId: "user-42" }),
    findLatestAttempt: async () => ({ id: LOG_ID, attemptNumber: 3 }),
    insertRetry: async () => NEW_ID,
  };
});

// ---------------------------------------------------------------------------
describe("recordStaffLog", () => {
  const ban = (overrides = {}) => ({
    action: "user.banned",
    resource: { type: "user", id: "user-42" },
    message: [text("Banned "), user({ id: "user-42", name: "Anna" })],
    ...overrides,
  });

  test("the actor is the context's user and the search sentence is derived from the blocks", async () => {
    expect(await recordStaffLog(ada, ban())).toBeUndefined();
    expect(insertStaffLog).toHaveBeenCalledTimes(1);
    const [ctx, entry] = insertStaffLog.mock.calls[0];
    expect(ctx).toBe(ada);
    expect(entry).toEqual({
      actorId: "user-ada",
      action: "user.banned",
      resourceType: "user",
      resourceId: "user-42",
      message: [{ type: "text", value: "Banned " }, { type: "user", id: "user-42", label: "Anna" }],
      messageText: "Banned Anna",
    });
  });

  test("an invalid entry is refused with paths and codes only, before anything is written", async () => {
    const secret = "do-not-echo-482913";
    for (const entry of [
      ban({ resource: { type: "user", id: "" } }),
      ban({ message: [] }),
      ban({ message: [{ type: "text", value: `two\nlines ${secret}` }] }),
      ban({ actorId: "someone-else" }),
    ]) {
      const error = await failure(recordStaffLog(ada, entry));
      expect(error).toBeInstanceOf(StaffLogError);
      expect(error.message).toMatch(/^Invalid staff log entry \(.*: [a-z_]+.*\)\.$/);
      expect(error.message).not.toContain(secret);
      expect(error.cause).toBeUndefined();
    }
    nothingReached();
  });

  test("a storage failure is a StaffLogError that keeps its cause and repeats no value", async () => {
    const driver = Object.assign(new Error("insert failed"), { code: "23503" });
    world.insertStaffLog = async () => {
      throw driver;
    };
    const error = await failure(recordStaffLog(ada, ban()));
    expect(error).toBeInstanceOf(StaffLogError);
    expect(error.message).toBe('Staff log entry "user.banned" could not be stored.');
    expect(error.cause).toBe(driver);
  });

  test("the same action twice is written twice: there is no key to replay", async () => {
    await recordStaffLog(ada, ban());
    await recordStaffLog(ada, ban());
    expect(insertStaffLog).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
describe("beginEmailLog: preparation", () => {
  const email = (overrides = {}) => ({
    recordKey: "email:1",
    recipientEmail: "  Alice@Example.TEST ",
    recipientUserId: "user-42",
    recipientLabel: "Alice",
    subject: "482913 is your verification code",
    contentText: "Your verification code is 482913.",
    provider: "resend",
    secrets: { verificationCode: "482913" },
    ...overrides,
  });
  const prepared = () => insertInitialAttempt.mock.calls.at(-1)[1];

  test("persistence is handed the sanitized snapshot: no secret, no raw input, the requester from the context", async () => {
    expect(await beginEmailLog(ada, email())).toEqual({ id: NEW_ID, duplicate: false });
    expect(calls).toEqual(["insertInitialAttempt"]);
    const [ctx, attempt] = insertInitialAttempt.mock.calls[0];
    expect(ctx).toBe(ada);
    expect(attempt).toEqual({
      recordKey: "email:1",
      inputDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      startedAt: undefined,
      recipientEmail: "alice@example.test",
      recipientUserId: "user-42",
      recipientLabel: "Alice",
      subject: `${REDACTED} is your verification code`,
      contentText: `Your verification code is ${REDACTED}.`,
      provider: "resend",
      requesterKind: "user",
      requesterId: "user-ada",
      requesterLabel: "Ada Lovelace",
      requestId: "req-1",
      redactionVersion: 1,
      searchText: `${REDACTED} is your verification code\nalice@example.test\nAlice`,
    });
    expect(JSON.stringify(insertInitialAttempt.mock.calls)).not.toContain("482913");

    await beginEmailLog(anonymous, email({ recipientUserId: undefined, recipientLabel: undefined, provider: undefined }));
    expect(prepared()).toMatchObject({
      requesterKind: "anonymous",
      requesterId: null,
      requesterLabel: "Anonymous",
      requestId: "req-public",
      recipientUserId: null,
      recipientLabel: null,
      provider: null,
    });
  });

  test("the fingerprint is of the canonical sanitized payload, and of nothing else", async () => {
    const startedAt = new Date("2026-09-20T10:00:00.000Z");
    await beginEmailLog(ada, email({ startedAt, previousAttemptId: undefined }));
    expect(prepared().startedAt).toEqual(startedAt);
    expect(prepared().inputDigest).toBe(
      await sha256Hex(
        canonicalJson({
          recordKey: "email:1",
          startedAt,
          recipientEmail: "alice@example.test",
          recipientUserId: "user-42",
          recipientLabel: "Alice",
          subject: `${REDACTED} is your verification code`,
          contentText: `Your verification code is ${REDACTED}.`,
          provider: "resend",
          previousAttemptId: null,
          requester: { kind: "user", id: "user-ada" },
        }),
      ),
    );

    const digestOf = async (ctx, input) => {
      await beginEmailLog(ctx, input);
      return prepared().inputDigest;
    };
    const original = await digestOf(ada, email());
    // The same request later: another request ID, the account renamed, the secret declared under another label.
    const renamed = { user: { id: "user-ada", name: "Ada King" }, requestId: "req-2" };
    expect(await digestOf(renamed, email({ secrets: { code: ["482913"] } }))).toBe(original);
    // An omitted start is not the same as a supplied one.
    expect(await digestOf(ada, email({ startedAt }))).not.toBe(original);
    // The requester's identity, the recipient's label and every semantic field are part of it.
    expect(await digestOf({ ...ada, user: { id: "user-eve", name: "Ada Lovelace" } }, email())).not.toBe(original);
    expect(await digestOf(anonymous, email())).not.toBe(original);
    expect(await digestOf(ada, email({ recipientLabel: "Alicia" }))).not.toBe(original);
    expect(await digestOf(ada, email({ recipientUserId: undefined }))).not.toBe(original);
    expect(await digestOf(ada, email({ subject: "Another subject" }))).not.toBe(original);
    expect(await digestOf(ada, email({ provider: undefined }))).not.toBe(original);
  });

  test("the raw record is bounded before it is parsed", async () => {
    // Oversize and invalid in three other ways: only the size is reported.
    const oversize = email({ contentText: "x".repeat(520 * 1024), recipientEmail: "not an address", extra: true, startedAt: new Date(Date.now() + 86_400_000) });
    expect((await refusal(beginEmailLog(ada, oversize), "INVALID_RECORD")).issues).toEqual([{ path: "", code: "too_big" }]);
    const cyclic = email();
    cyclic.self = cyclic;
    expect((await refusal(beginEmailLog(ada, cyclic), "INVALID_RECORD")).issues).toEqual([{ path: "", code: "invalid_type" }]);
    nothingReached();
  });

  test("invalid input names paths and codes, never the value", async () => {
    const error = await refusal(beginEmailLog(ada, email({ recipientEmail: "not-an-address-482913", extra: "482913" })), "INVALID_RECORD");
    expect(error.issues.map((issue) => issue.path).sort()).toEqual(["", "recipientEmail"]);
    expect(JSON.stringify(error.issues) + error.message).not.toContain("482913");
    expect((await refusal(beginEmailLog(ada, { ...email(), secrets: undefined }), "INVALID_RECORD")).issues[0].path).toBe("secrets");
    nothingReached();
  });

  test("a start in the future is refused before redaction is consulted", async () => {
    const future = new Date(Date.now() + 6 * 60_000);
    // The record key also holds a declared secret: the time is what is reported.
    const input = email({ startedAt: future, recordKey: "email:482913" });
    expect((await refusal(beginEmailLog(ada, input), "INVALID_RECORD")).issues).toEqual([{ path: "startedAt", code: "in_future" }]);
    // Within the permitted skew it is recorded.
    await beginEmailLog(ada, email({ startedAt: new Date(Date.now() + 4 * 60_000) }));
    expect(insertInitialAttempt).toHaveBeenCalledTimes(1);
  });

  test("a declared secret in a structural field refuses the record and writes nothing", async () => {
    const previousAttemptId = "01900000-0000-7000-8000-000000482913";
    const cases = [
      [ada, email({ recordKey: "email:482913" }), "recordKey"],
      [ada, email({ recipientEmail: "a482913@example.test" }), "recipientEmail"],
      [ada, email({ recipientUserId: "user-482913" }), "recipientUserId"],
      [ada, email({ provider: "p482913" }), "provider"],
      [ada, email({ previousAttemptId }), "previousAttemptId"],
      [{ ...ada, user: { id: "user-482913", name: "Ada" } }, email(), "requester.id"],
    ];
    for (const [ctx, input, path] of cases) {
      const error = await refusal(beginEmailLog(ctx, input), "INVALID_RECORD");
      expect(error.issues).toEqual([{ path, code: "sensitive_value" }]);
    }
    nothingReached();
  });

  test("display fields are redacted first and have to fit what is stored afterwards", async () => {
    // A 1-character secret replaced by a 10-character marker pushes the subject past 500.
    const subject = "q ".repeat(249) + "q";
    expect((await refusal(beginEmailLog(ada, email({ subject, secrets: { s: "q" } })), "INVALID_RECORD")).issues).toEqual([
      { path: "subject", code: "too_big" },
    ]);
    const label = "ab ".repeat(66).trim();
    expect((await refusal(beginEmailLog(ada, email({ recipientLabel: label, secrets: { s: "ab" } })), "INVALID_RECORD")).issues).toEqual([
      { path: "recipientLabel", code: "too_big" },
    ]);
    nothingReached();
    // The context's name is clipped, never a reason to refuse.
    await beginEmailLog({ ...ada, user: { id: "user-ada", name: "N".repeat(300) } }, email());
    expect(prepared().requesterLabel).toHaveLength(200);
    await beginEmailLog({ ...ada, user: { id: "user-ada", name: "  " } }, email());
    expect(prepared().requesterLabel).toBe("Unnamed user");
  });
});

// ---------------------------------------------------------------------------
describe("beginEmailLog: the record key", () => {
  const email = (overrides = {}) => ({
    recordKey: "email:1",
    recipientEmail: "alice@example.test",
    recipientUserId: "user-42",
    subject: "Welcome",
    contentText: "Hello",
    secrets: {},
    ...overrides,
  });
  /** The key already names `LOG_ID`, recorded from `input` by `ctx`. */
  async function recordedFrom(ctx, input) {
    await beginEmailLog(ctx, input);
    const { inputDigest } = insertInitialAttempt.mock.calls.at(-1)[1];
    world.insertInitialAttempt = async () => null;
    world.findAttemptByRecordKey = async () => ({ id: LOG_ID, inputDigest });
    calls.length = 0;
  }

  test("a first attempt is one insert: nothing is looked up before or after it", async () => {
    expect(await beginEmailLog(ada, email())).toEqual({ id: NEW_ID, duplicate: false });
    expect(calls).toEqual(["insertInitialAttempt"]);
  });

  test("a key that is taken is looked up once: the same payload is a replay, anything else a conflict", async () => {
    await recordedFrom(ada, email());
    expect(await beginEmailLog({ ...ada, requestId: "req-again" }, email())).toEqual({ id: LOG_ID, duplicate: true });
    expect(calls).toEqual(["insertInitialAttempt", "findAttemptByRecordKey"]);
    expect(findAttemptByRecordKey.mock.calls.at(-1)[1]).toBe("email:1");

    await refusal(beginEmailLog(ada, email({ subject: "Another subject" })), "RECORD_KEY_CONFLICT");
    await refusal(beginEmailLog(anonymous, email()), "RECORD_KEY_CONFLICT");
  });

  test("a key that was refused but names no row is a storage failure, not a reason to write again", async () => {
    world.insertInitialAttempt = async () => null;
    world.findAttemptByRecordKey = async () => null;
    expect((await refusal(beginEmailLog(ada, email()), "STORAGE_FAILED")).issues).toEqual([]);
    expect(calls).toEqual(["insertInitialAttempt", "findAttemptByRecordKey"]);
  });

  test("a driver failure keeps its SQLSTATE and constraint, and nothing of the statement", async () => {
    world.insertInitialAttempt = async () => {
      throw Object.assign(new Error('insert into "email_log" ... params: Welcome, alice@example.test'), {
        cause: Object.assign(new Error("violates check"), { code: "23514", constraint: "email_log_text_check" }),
      });
    };
    const error = await refusal(beginEmailLog(ada, email()), "STORAGE_FAILED");
    expect(error.message).toBe("The log record could not be stored.");
    expect(error.issues).toEqual([
      { path: "database", code: "23514" },
      { path: "constraint", code: "email_log_text_check" },
    ]);
    expect(JSON.stringify(error)).not.toContain("alice@example.test");
  });
});

// ---------------------------------------------------------------------------
describe("beginEmailLog: retries", () => {
  const retry = (overrides = {}) => ({
    recordKey: "email:retry",
    recipientEmail: "alice@example.test",
    recipientUserId: "user-42",
    subject: "New code",
    contentText: "Hello again",
    previousAttemptId: LOG_ID,
    secrets: {},
    ...overrides,
  });
  const digestOf = async (ctx, input) => {
    await beginEmailLog(ctx, input);
    const [attempt] = chain.insertRetry.mock.calls.at(-1);
    calls.length = 0;
    return attempt.inputDigest;
  };

  test("a retry is decided inside one transaction, in order, and takes the next number of its chain", async () => {
    expect(await beginEmailLog(ada, retry())).toEqual({ id: NEW_ID, duplicate: false });
    expect(calls).toEqual([
      "withRetryChain",
      "chain.findByRecordKey",
      "chain.findPredecessor",
      "chain.lockOriginal",
      "chain.findByRecordKey",
      "chain.findLatestAttempt",
      "chain.insertRetry",
    ]);
    expect(withRetryChain.mock.calls[0][0]).toBe(ada);
    expect(chain.findPredecessor.mock.calls[0]).toEqual([LOG_ID]);
    expect(chain.lockOriginal.mock.calls[0]).toEqual([ORIGINAL_ID]);
    expect(chain.findLatestAttempt.mock.calls[0]).toEqual([ORIGINAL_ID]);
    const [attempt, position] = chain.insertRetry.mock.calls[0];
    expect(position).toEqual({ attemptNumber: 4, originalLogId: ORIGINAL_ID, previousAttemptId: LOG_ID });
    expect(attempt).toMatchObject({ recordKey: "email:retry", subject: "New code", requesterId: "user-ada" });
    expect(insertInitialAttempt).not.toHaveBeenCalled();
  });

  test("a retry of the original itself belongs to the original's own chain", async () => {
    world.chain.findPredecessor = async (id) => ({ id, originalLogId: null });
    world.chain.findLatestAttempt = async () => ({ id: LOG_ID, attemptNumber: 1 });
    await beginEmailLog(ada, retry());
    expect(chain.lockOriginal.mock.calls[0]).toEqual([LOG_ID]);
    expect(chain.insertRetry.mock.calls[0][1]).toEqual({ attemptNumber: 2, originalLogId: LOG_ID, previousAttemptId: LOG_ID });
  });

  test("a replay is answered before the chain is looked at: its predecessor is stale by then", async () => {
    const inputDigest = await digestOf(ada, retry());
    world.chain.findByRecordKey = async () => ({ id: NEW_ID, inputDigest });
    // The chain has moved on, and would refuse this predecessor.
    world.chain.findLatestAttempt = async () => ({ id: NEW_ID, attemptNumber: 4 });
    expect(await beginEmailLog(ada, retry())).toEqual({ id: NEW_ID, duplicate: true });
    expect(calls).toEqual(["withRetryChain", "chain.findByRecordKey"]);
    calls.length = 0;
    await refusal(beginEmailLog(ada, retry({ subject: "Different" })), "RECORD_KEY_CONFLICT");
    expect(calls).toEqual(["withRetryChain", "chain.findByRecordKey"]);
  });

  test("a missing predecessor or original is NOT_FOUND, naming the field", async () => {
    world.chain.findPredecessor = async () => null;
    expect((await refusal(beginEmailLog(ada, retry()), "NOT_FOUND")).issues).toEqual([{ path: "previousAttemptId", code: "not_found" }]);
    expect(calls).toEqual(["withRetryChain", "chain.findByRecordKey", "chain.findPredecessor"]);

    world.chain.findPredecessor = async (id) => ({ id, originalLogId: ORIGINAL_ID });
    world.chain.lockOriginal = async () => null;
    expect((await refusal(beginEmailLog(ada, retry()), "NOT_FOUND")).issues).toEqual([{ path: "previousAttemptId", code: "not_found" }]);
    expect(chain.insertRetry).not.toHaveBeenCalled();
  });

  test("the key is checked again after the lock: a request that waited finds what the winner recorded", async () => {
    const inputDigest = await digestOf(ada, retry());
    let lookups = 0;
    world.chain.findByRecordKey = async () => (++lookups === 1 ? null : { id: NEW_ID, inputDigest });
    expect(await beginEmailLog(ada, retry())).toEqual({ id: NEW_ID, duplicate: true });
    expect(calls).toEqual(["withRetryChain", "chain.findByRecordKey", "chain.findPredecessor", "chain.lockOriginal", "chain.findByRecordKey"]);
  });

  test("a stale predecessor is refused before the recipient is compared", async () => {
    world.chain.findLatestAttempt = async () => ({ id: NEW_ID, attemptNumber: 4 });
    await refusal(beginEmailLog(ada, retry()), "STALE_PREDECESSOR");
    // Stale and for another recipient: stale.
    await refusal(beginEmailLog(ada, retry({ recipientEmail: "bob@example.test" })), "STALE_PREDECESSOR");
    world.chain.findLatestAttempt = async () => null;
    await refusal(beginEmailLog(ada, retry()), "STALE_PREDECESSOR");
    expect(chain.insertRetry).not.toHaveBeenCalled();
  });

  test("the recipient is the chain's: address and user ID, as normalized", async () => {
    await refusal(beginEmailLog(ada, retry({ recipientEmail: "bob@example.test" })), "RECIPIENT_MISMATCH");
    await refusal(beginEmailLog(ada, retry({ recipientUserId: "user-43" })), "RECIPIENT_MISMATCH");
    await refusal(beginEmailLog(ada, retry({ recipientUserId: undefined })), "RECIPIENT_MISMATCH");
    expect(chain.insertRetry).not.toHaveBeenCalled();
    // Case and padding are not a different recipient; the subject and body may change.
    await beginEmailLog(ada, retry({ recipientEmail: " ALICE@example.test ", subject: "Entirely new", contentText: "New body" }));
    expect(chain.insertRetry).toHaveBeenCalledTimes(1);
  });

  test("a key taken between the recheck and the insert is classified in the same transaction", async () => {
    const inputDigest = await digestOf(ada, retry());
    let lookups = 0;
    world.chain.insertRetry = async () => null;
    world.chain.findByRecordKey = async () => (++lookups < 3 ? null : { id: NEW_ID, inputDigest });
    expect(await beginEmailLog(ada, retry())).toEqual({ id: NEW_ID, duplicate: true });
    expect(calls.at(-1)).toBe("chain.findByRecordKey");

    lookups = 0;
    world.chain.findByRecordKey = async () => (++lookups < 3 ? null : { id: NEW_ID, inputDigest: "0".repeat(64) });
    await refusal(beginEmailLog(ada, retry()), "RECORD_KEY_CONFLICT");
    world.chain.findByRecordKey = async () => null;
    await refusal(beginEmailLog(ada, retry()), "STORAGE_FAILED");
  });

  test("a refused retry never opens the transaction", async () => {
    await refusal(beginEmailLog(ada, retry({ previousAttemptId: "not-a-uuid" })), "INVALID_RECORD");
    await refusal(beginEmailLog(ada, retry({ startedAt: new Date(Date.now() + 86_400_000) })), "INVALID_RECORD");
    nothingReached();
  });
});

// ---------------------------------------------------------------------------
describe("completeEmailLog", () => {
  const observed = (overrides = {}) => ({ id: LOG_ID, status: "accepted", providerMessageId: "msg_1", secrets: {}, ...overrides });
  const prepared = () => tryCompleteAttempt.mock.calls.at(-1)[1];
  const startedAt = new Date("2026-09-20T10:00:00.000Z");
  /** The statement wrote nothing; the attempt is as `state` says. */
  const leftAs = (state) => {
    world.tryCompleteAttempt = async () => null;
    world.findCompletionState = async () => state && { startedAt, completionDigest: null, ...state };
  };
  const digestOf = async (input, ctx = ada) => {
    const write = world.tryCompleteAttempt;
    world.tryCompleteAttempt = async (_, completion) => completion.id;
    await completeEmailLog(ctx, input);
    world.tryCompleteAttempt = write;
    const { completionDigest } = prepared();
    calls.length = 0;
    return completionDigest;
  };

  test("an observation is one conditional write: when it is taken, nothing is read", async () => {
    expect(await completeEmailLog(ada, observed())).toEqual({ id: LOG_ID, duplicate: false });
    expect(calls).toEqual(["tryCompleteAttempt"]);
    const [ctx, completion, completableFrom] = tryCompleteAttempt.mock.calls[0];
    expect(ctx).toBe(ada);
    expect(completableFrom).toEqual(["sending", "unknown"]);
    // What was not supplied is null, so that it is written as null; an omitted time stays omitted.
    expect(completion).toEqual({
      id: LOG_ID,
      status: "accepted",
      completedAt: undefined,
      providerMessageId: "msg_1",
      errorCode: null,
      errorMessage: null,
      stackTrace: null,
      completionDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  test("each observation names the statuses it may be recorded from", async () => {
    const from = async (status) => {
      await completeEmailLog(ada, observed({ status }));
      return tryCompleteAttempt.mock.calls.at(-1)[2];
    };
    expect(await from("accepted")).toEqual(["sending", "unknown"]);
    expect(await from("failed")).toEqual(["sending", "unknown"]);
    expect(await from("unknown")).toEqual(["sending"]);
  });

  test("the fingerprint is of the log ID and the sanitized observation; the context is not part of it", async () => {
    const completedAt = new Date("2026-09-20T10:00:05.000Z");
    const input = observed({ status: "failed", completedAt, providerMessageId: undefined, errorCode: "BOUNCED", errorMessage: "Code 482913 refused", secrets: { code: "482913" } });
    const digest = await digestOf(input);
    expect(digest).toBe(
      await sha256Hex(
        canonicalJson({
          id: LOG_ID,
          status: "failed",
          completedAt,
          providerMessageId: null,
          errorCode: "BOUNCED",
          errorMessage: `Code ${REDACTED} refused`,
          stackTrace: null,
        }),
      ),
    );
    expect(await digestOf(input, anonymous)).toBe(digest);
    expect(await digestOf({ ...input, completedAt: undefined })).not.toBe(digest);
    expect(await digestOf({ ...input, errorCode: "OTHER" })).not.toBe(digest);
    expect(await digestOf({ ...input, id: NEW_ID })).not.toBe(digest);
  });

  test("diagnostics are redacted before they are cut, so a cut cannot leave part of a secret", async () => {
    const secret = "tok_SENSITIVE_abcdef";
    // The secret straddles both limits: cut first, its head would be stored.
    const errorMessage = "m".repeat(3_990) + secret + " tail";
    const stackTrace = "s".repeat(32 * 1024 - 10) + secret + "\n    at send";
    await completeEmailLog(ada, observed({ status: "failed", errorCode: `E_${secret}`, errorMessage, stackTrace, secrets: { token: secret } }));
    const completion = prepared();
    expect(completion.errorCode).toBe(`E_${REDACTED}`);
    expect(completion.errorMessage.length).toBeLessThanOrEqual(4_000);
    expect(Buffer.byteLength(completion.stackTrace)).toBeLessThanOrEqual(32 * 1024);
    for (const part of ["tok_", "SENSITIVE", "abcdef"]) expect(JSON.stringify(completion)).not.toContain(part);
  });

  test("a refused observation reaches nothing: size, shape, a future time, a secret in the provider ID, an oversize code", async () => {
    const cases = [
      [observed({ stackTrace: "x".repeat(520 * 1024), id: "not-a-uuid" }), { path: "", code: "too_big" }],
      [observed({ status: "delivered" }), { path: "status", code: "invalid_value" }],
      // In the future and carrying a secret: the time is reported.
      [observed({ completedAt: new Date(Date.now() + 6 * 60_000), providerMessageId: "id-482913", secrets: { code: "482913" } }), { path: "completedAt", code: "in_future" }],
      [observed({ providerMessageId: "id-482913", secrets: { code: "482913" } }), { path: "providerMessageId", code: "sensitive_value" }],
      // 99 characters before redaction, more after it.
      [observed({ status: "failed", errorCode: "q-".repeat(49) + "q", secrets: { s: "q" } }), { path: "errorCode", code: "too_big" }],
    ];
    for (const [input, issue] of cases) {
      expect((await refusal(completeEmailLog(ada, input), "INVALID_RECORD")).issues).toEqual([issue]);
    }
    nothingReached();
  });

  test("nothing written and no such attempt is NOT_FOUND", async () => {
    leftAs(null);
    expect((await refusal(completeEmailLog(ada, observed()), "NOT_FOUND")).issues).toEqual([{ path: "id", code: "not_found" }]);
    expect(calls).toEqual(["tryCompleteAttempt", "findCompletionState"]);
    expect(findCompletionState.mock.calls[0]).toEqual([ada, LOG_ID]);
  });

  test("the identical observation is a duplicate, from any context, and is not written again", async () => {
    const completionDigest = await digestOf(observed());
    for (const status of ["accepted", "failed", "unknown"]) {
      leftAs({ status, completionDigest });
      expect(await completeEmailLog(anonymous, observed())).toEqual({ id: LOG_ID, duplicate: true });
    }
    expect(tryCompleteAttempt).toHaveBeenCalledTimes(4);
    // An attempt still `sending` has recorded nothing to be a duplicate of.
    leftAs({ status: "sending", completionDigest });
    await refusal(completeEmailLog(ada, observed()), "STORAGE_FAILED");
  });

  test("the transition table: what is final stays, and unknown is resolved once", async () => {
    const other = "0".repeat(64);
    const conflicts = [
      ["accepted", "failed"],
      ["accepted", "unknown"],
      ["accepted", "accepted"],
      ["failed", "accepted"],
      ["failed", "unknown"],
      ["failed", "failed"],
      ["unknown", "unknown"],
    ];
    for (const [current, incoming] of conflicts) {
      leftAs({ status: current, completionDigest: other });
      const error = await refusal(completeEmailLog(ada, observed({ status: incoming })), "COMPLETION_CONFLICT");
      expect(error.issues).toEqual([]);
    }
    // Resolved to accepted: a late replay of the unknown it replaced is a conflict, not a duplicate.
    const unknown = observed({ status: "unknown", providerMessageId: undefined, errorCode: "TIMEOUT" });
    await digestOf(unknown);
    leftAs({ status: "accepted", completionDigest: other });
    await refusal(completeEmailLog(ada, unknown), "COMPLETION_CONFLICT");
  });

  test("precedence: duplicate, then conflict, then a time before the start", async () => {
    const early = observed({ completedAt: new Date(startedAt.getTime() - 1) });
    const completionDigest = await digestOf(early);

    leftAs({ status: "accepted", completionDigest });
    expect(await completeEmailLog(ada, early)).toEqual({ id: LOG_ID, duplicate: true });
    // Final and too early: the conflict is the answer.
    leftAs({ status: "failed", completionDigest: "0".repeat(64) });
    await refusal(completeEmailLog(ada, early), "COMPLETION_CONFLICT");
    // Still recordable: the time is the reason.
    for (const status of ["sending", "unknown"]) {
      leftAs({ status, completionDigest: status === "sending" ? null : "0".repeat(64) });
      expect((await refusal(completeEmailLog(ada, early), "INVALID_RECORD")).issues).toEqual([{ path: "completedAt", code: "before_start" }]);
    }
    // At the start exactly is not before it.
    leftAs({ status: "sending" });
    await refusal(completeEmailLog(ada, observed({ completedAt: startedAt })), "STORAGE_FAILED");
  });

  test("a write that should have been taken is a storage failure: never assumed recorded, never tried again", async () => {
    leftAs({ status: "sending" });
    const error = await refusal(completeEmailLog(ada, observed()), "STORAGE_FAILED");
    expect(error.issues).toEqual([]);
    expect(calls).toEqual(["tryCompleteAttempt", "findCompletionState"]);
  });

  test("a driver failure in the write or the read keeps only its SQLSTATE", async () => {
    world.tryCompleteAttempt = async () => {
      throw Object.assign(new Error("update email_log set ... params: msg_1"), { code: "23000" });
    };
    const refused = await refusal(completeEmailLog(ada, observed()), "STORAGE_FAILED");
    expect(refused.issues).toEqual([{ path: "database", code: "23000" }]);
    expect(JSON.stringify(refused)).not.toContain("msg_1");
    expect(calls).toEqual(["tryCompleteAttempt"]);

    leftAs({ status: "sending" });
    world.findCompletionState = async () => {
      throw Object.assign(new Error("timeout"), { code: "57014" });
    };
    expect((await refusal(completeEmailLog(ada, observed()), "STORAGE_FAILED")).issues).toEqual([{ path: "database", code: "57014" }]);
  });
});
