import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { sendEmailChangeConfirmationEmail, type EmailChangePurpose } from "@/src/lib/email";
import { errorMessage } from "@/src/lib/errorMessage";
import { acquireCooldown, consumeBudget, isCoolingDown, type ThrottleDecision } from "@/src/lib/throttle";
import { EMAIL_CHANGE_POLICY } from "@/app/(AuthModule)/_/policies/limits";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/services/throttleKeys";
import type { EmailDelivery } from "@/app/(AuthModule)/_/types/settings";
import { confirmationUrl } from "./tokens";

/**
 * Mailing a confirmation link, in two steps a caller can separate: the
 * permission to send (a cooldown per purpose and an hourly allowance across
 * the settings flows) and the send itself. Neither runs inside a database
 * transaction or while the account security lock is held.
 */

export type Delivery = { delivery: EmailDelivery; retryAfterSeconds?: number };

export type Link = { to: string; purpose: EmailChangePurpose; token: string; expiresAt: Date };

/**
 * Charges one send to the actor: the purpose's cooldown, then the hourly
 * allowance. `null` when the send may go ahead; otherwise how the refusal
 * is reported. A charge is never handed back, whatever happens to the mail.
 */
export async function reserveDelivery(ctx: AuthedCtx, purpose: EmailChangePurpose): Promise<Delivery | null> {
  const cooldown = await acquireCooldown(
    settingsThrottleKeys.emailSendCooldown(ctx.user.id, purpose),
    EMAIL_CHANGE_POLICY.sendCooldownSeconds,
  );
  if (!cooldown.allowed) return { delivery: "rate-limited", retryAfterSeconds: cooldown.retryAfterSeconds };

  const { limit, windowSeconds } = EMAIL_CHANGE_POLICY.sends;
  const budget = await consumeBudget(settingsThrottleKeys.emailSends(ctx.user.id), limit, windowSeconds);
  if (!budget.allowed) return { delivery: "rate-limited", retryAfterSeconds: budget.retryAfterSeconds };
  return null;
}

/** Mails the link. A failure is logged and reported; nothing is refunded or retried. */
export async function sendLink(ctx: AuthedCtx, link: Link): Promise<Delivery> {
  try {
    await sendEmailChangeConfirmationEmail({
      to: link.to,
      url: await confirmationUrl(link.token),
      token: link.token,
      purpose: link.purpose,
      expiresAt: link.expiresAt,
      name: ctx.user.name,
      recipient: { userId: ctx.user.id, name: ctx.user.name },
    });
    return { delivery: "sent" };
  } catch (error) {
    ctx.log.error(`email change link (${link.purpose}) could not be sent`, { error: errorMessage(error) });
    return { delivery: "failed" };
  }
}

/** Reserves, then sends: for the steps whose request is already stored when the mail goes out. */
export async function deliverLink(ctx: AuthedCtx, link: Link): Promise<Delivery> {
  return (await reserveDelivery(ctx, link.purpose)) ?? sendLink(ctx, link);
}

/** Whether the purpose's cooldown has lifted, read-only: checking charges nothing. */
export function checkSendCooldown(ctx: AuthedCtx, purpose: EmailChangePurpose): Promise<ThrottleDecision> {
  return isCoolingDown(settingsThrottleKeys.emailSendCooldown(ctx.user.id, purpose));
}

/** When the purpose's cooldown lifts, as an instant for the owner's status view; `null` when it has. */
export async function resendAvailableAt(ctx: AuthedCtx, purpose: EmailChangePurpose, now: Date): Promise<string | null> {
  try {
    const cooling = await checkSendCooldown(ctx, purpose);
    return cooling.allowed ? null : new Date(now.getTime() + cooling.retryAfterSeconds * 1000).toISOString();
  } catch {
    // A status detail only; the resend action itself fails closed.
    return null;
  }
}
