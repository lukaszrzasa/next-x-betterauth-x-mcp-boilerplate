import { isEffectivelyBanned } from "@/src/lib/auth/sessionAuthority";
import type { EmailChangePurpose } from "@/src/lib/email";
import {
  ACTIVE_STATES,
  type EmailChangeRequestRow,
  type EmailRequestCancelReason,
} from "@/app/(AuthModule)/_/db/emailRequests/requests";

/**
 * The lifecycle rules of an email change request, as pure decisions over
 * rows the caller has read. One fixed deadline covers the whole request;
 * a token proves only the stage it was issued for.
 */

export const isActive = (row: EmailChangeRequestRow): boolean => (ACTIVE_STATES as string[]).includes(row.state);

/** The deadline is absolute: at `expiresAt` the request is already overdue. */
export const isExpired = (row: EmailChangeRequestRow, now: Date): boolean =>
  now.getTime() >= row.expiresAt.getTime();

type Owner = { email: string; emailVerified: boolean };

/** A request the account has moved past: its address changed, or a correction's address got verified. */
export const isSuperseded = (row: EmailChangeRequestRow, owner: Owner): boolean =>
  row.originalEmail !== owner.email || (row.kind === "correction" && owner.emailVerified);

/** Which mailbox a token digest proves for the request holding it. */
export const purposeOf = (row: EmailChangeRequestRow, hash: string): EmailChangePurpose =>
  row.currentTokenHash === hash ? "current" : "new";

/** Whether a proof was issued for the stage the request is at now; an earlier stage's link proves nothing. */
export function provesCurrentStage(row: EmailChangeRequestRow, purpose: EmailChangePurpose): boolean {
  return purpose === "current" ? row.state === "awaiting_current" : row.state === "awaiting_new";
}

export type MailStage = { purpose: EmailChangePurpose; to: string; generation: number };

/** Which confirmation email the request is waiting on at its current step, or `null` when none is due. */
export function awaitedMail(row: EmailChangeRequestRow): MailStage | null {
  if (row.state === "awaiting_current") {
    return { purpose: "current", to: row.originalEmail, generation: row.currentTokenGeneration };
  }
  if (row.state === "awaiting_new" && row.newEmail) {
    return { purpose: "new", to: row.newEmail, generation: row.newTokenGeneration };
  }
  return null;
}

type FinalizingAccount = Owner & { banned: boolean | null; banExpires: Date | null };

/** Why a matching, unexpired request can no longer commit its new address, or `null` when it can. */
export function finalizationBlocker(
  account: FinalizingAccount,
  row: EmailChangeRequestRow,
  now: Date,
): EmailRequestCancelReason | null {
  if (isEffectivelyBanned(account, now)) return "banned";
  if (account.email !== row.originalEmail) return "account_changed";
  if (row.kind === "change" && (row.currentConfirmedAt === null || !account.emailVerified)) return "account_changed";
  if (row.kind === "correction" && account.emailVerified) return "account_changed";
  return null;
}
