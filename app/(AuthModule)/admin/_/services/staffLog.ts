import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { errorMessage } from "@/src/lib/errorMessage";
import { recordStaffLog } from "@/app/(LogsModule)/_/db/staffLogService";
import { date, text, user, value, type StaffLogBlock } from "@/app/(LogsModule)/_/staffLog/blocks";
import type { UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";

/**
 * The staff log entries of user administration: one per staff action that
 * changed an account or its sessions, written by the operation once the
 * change is confirmed. Sending an email changes nothing
 * and is not logged here; the email log has the message.
 *
 * A `user` block names the account as it is after the action.
 */

type Account = { id: string; name: string };

export type UserLogEntry = { action: UserLogAction; account: Account; message: StaffLogBlock[] };

export type UserLogAction =
  | "user.name.updated"
  | "user.email.updated"
  | "user.banned"
  | "user.ban.updated"
  | "user.unbanned"
  | "user.sessions.revoked"
  | "user.sessions.retried";

export const nameUpdated = (account: Account, before: string): UserLogEntry => ({
  action: "user.name.updated",
  account,
  message: [text("Changed name from "), value(before), text(" to "), user(account)],
});

export const emailUpdated = (account: Account, before: string, after: string): UserLogEntry => ({
  action: "user.email.updated",
  account,
  message: [text("Changed email of "), user(account), text(" from "), value(before), text(" to "), value(after)],
});

export function banned(
  account: Account,
  ban: { replacing: boolean; expires: Date | null; reason: string | null },
): UserLogEntry {
  const until = ban.expires ? [text(" until "), date(ban.expires)] : [text(" permanently")];
  const reason = ban.reason?.trim() ? [text(". Reason: "), value(ban.reason)] : [];
  return ban.replacing
    ? { action: "user.ban.updated", account, message: [text("Updated ban of "), user(account), text(":"), ...until, ...reason] }
    : { action: "user.banned", account, message: [text("Banned "), user(account), ...until, ...reason] };
}

export const unbanned = (account: Account): UserLogEntry => ({
  action: "user.unbanned",
  account,
  message: [text("Unbanned "), user(account)],
});

export const sessionsRevoked = (account: Account): UserLogEntry => ({
  action: "user.sessions.revoked",
  account,
  message: [text("Signed out all sessions of "), user(account)],
});

/** The recovery twins: `effect` is what they re-ran, e.g. "session sign-out". */
export const sessionsRetried = (account: Account, effect: "session sign-out" | "session refresh"): UserLogEntry => ({
  action: "user.sessions.retried",
  account,
  message: [text(`Retried ${effect} for `), user(account)],
});

/**
 * Writes the entry of a confirmed action and returns its outcome. The change
 * already happened, so a failed write does not fail the action: the outcome
 * says `unrecorded`, and the staff member is told.
 */
export async function logged(
  ctx: AuthedCtx,
  outcome: UserMutationOutcome,
  entry: UserLogEntry | undefined,
): Promise<UserMutationOutcome> {
  if (!entry || outcome.status === "unchanged") return outcome;
  try {
    await recordStaffLog(ctx, {
      action: entry.action,
      resource: { type: "user", id: entry.account.id },
      message: entry.message,
    });
    return outcome;
  } catch (error) {
    ctx.log.error("staff log entry not recorded", {
      action: entry.action,
      error: errorMessage(error),
      cause: error instanceof Error && error.cause ? errorMessage(error.cause) : undefined,
    });
    return { ...outcome, unrecorded: true };
  }
}
