import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const recordStaffLog = mock(async () => {});
mock.module("../../app/(LogsModule)/_/db/staffLogService.ts", () => ({ recordStaffLog }));

const { banned, emailUpdated, logged, nameUpdated, sessionsRetried, sessionsRevoked, unbanned } = await import(
  "../../app/(AuthModule)/admin/_/db/users/staffLog.ts"
);
const { messageText } = await import("../../app/(LogsModule)/_/staffLog/blocks.ts");
const { staffLogEntrySchema } = await import("../../app/(LogsModule)/_/staffLog/schema.ts");

const account = { id: "u-1", name: "Anna Kowalska" };
const errors = [];
const ctx = { user: { id: "staff-1" }, log: { error: (...args) => errors.push(args) } };
const sentence = (entry) => messageText(entry.message);

beforeEach(() => {
  recordStaffLog.mockReset();
  recordStaffLog.mockImplementation(async () => {});
  errors.length = 0;
});

describe("entries of user administration", () => {
  test("each reads as one sentence about the account as it is after the action", () => {
    const until = new Date("2026-09-25T14:32:00.000Z");
    expect(sentence(nameUpdated(account, "Anna K"))).toBe("Changed name from Anna K to Anna Kowalska");
    expect(sentence(emailUpdated(account, "a@example.com", "b@example.com"))).toBe(
      "Changed email of Anna Kowalska from a@example.com to b@example.com",
    );
    expect(sentence(banned(account, { replacing: false, expires: until, reason: "Spam" }))).toBe(
      "Banned Anna Kowalska until 25 Sep 2026, 14:32 UTC. Reason: Spam",
    );
    expect(sentence(banned(account, { replacing: false, expires: null, reason: "Spam" }))).toBe(
      "Banned Anna Kowalska permanently. Reason: Spam",
    );
    expect(sentence(banned(account, { replacing: true, expires: until, reason: null }))).toBe(
      "Updated ban of Anna Kowalska: until 25 Sep 2026, 14:32 UTC",
    );
    expect(sentence(unbanned(account))).toBe("Unbanned Anna Kowalska");
    expect(sentence(sessionsRevoked(account))).toBe("Signed out all sessions of Anna Kowalska");
    expect(sentence(sessionsRetried(account, "session sign-out"))).toBe("Retried session sign-out for Anna Kowalska");
  });

  test("a ban is two actions: applied, and updated when it replaces one", () => {
    expect(banned(account, { replacing: false, expires: null, reason: "x" }).action).toBe("user.banned");
    expect(banned(account, { replacing: true, expires: null, reason: "x" }).action).toBe("user.ban.updated");
  });

  test("every entry is one the log accepts, a reason typed on several lines included", () => {
    const entries = [
      nameUpdated(account, "Anna K"),
      emailUpdated(account, "a@example.com", "b@example.com"),
      banned(account, { replacing: false, expires: new Date(), reason: "First line\nsecond line" }),
      unbanned(account),
      sessionsRevoked(account),
      sessionsRetried(account, "session refresh"),
    ];
    for (const entry of entries) {
      const parsed = staffLogEntrySchema.safeParse({
        action: entry.action,
        resource: { type: "user", id: entry.account.id },
        message: entry.message,
      });
      expect(parsed.success, entry.action).toBe(true);
    }
  });
});

describe("logged", () => {
  const completed = { status: "completed", userId: "u-1" };

  test("writes the entry about the account and returns the outcome unchanged", async () => {
    const entry = unbanned(account);
    expect(await logged(ctx, completed, entry)).toBe(completed);
    expect(recordStaffLog).toHaveBeenCalledTimes(1);
    expect(recordStaffLog.mock.calls[0]).toEqual([
      ctx,
      { action: "user.unbanned", resource: { type: "user", id: "u-1" }, message: entry.message },
    ]);
  });

  test("nothing changed, or nothing was confirmed: nothing is written", async () => {
    const unchanged = { status: "unchanged", userId: "u-1" };
    expect(await logged(ctx, unchanged, unbanned(account))).toBe(unchanged);
    expect(await logged(ctx, completed, undefined)).toBe(completed);
    expect(recordStaffLog).not.toHaveBeenCalled();
  });

  test("an entry that cannot be written does not fail the action; the outcome says unrecorded", async () => {
    recordStaffLog.mockImplementation(async () => {
      throw new Error("storage down");
    });
    expect(await logged(ctx, completed, unbanned(account))).toEqual({ ...completed, unrecorded: true });
    const partial = { status: "partial", userId: "u-1", committed: true, effectsMayHaveApplied: true, failedEffects: [] };
    expect(await logged(ctx, partial, unbanned(account))).toEqual({ ...partial, unrecorded: true });
    expect(errors.map(([message]) => message)).toEqual(["staff log entry not recorded", "staff log entry not recorded"]);
  });
});
