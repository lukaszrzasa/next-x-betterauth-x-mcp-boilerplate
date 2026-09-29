import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { formatUtcDateTime } from "@/src/lib/date/format";
import { sendEmailChangeConfirmationEmail, type EmailChangePurpose } from "@/src/lib/email";
import { errorMessage } from "@/src/lib/errorMessage";
import { acquireCooldown, consumeBudget, isCoolingDown } from "@/src/lib/throttle";
import { EMAIL_CHANGE_POLICY } from "@/app/(AuthModule)/_/db/settings/shared/policy";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/db/settings/shared/throttleKeys";
import type { EmailDelivery } from "@/app/(AuthModule)/_/types/settings";
import { confirmationUrl } from "./tokens";

export type Delivery = { delivery: EmailDelivery; retryAfterSeconds?: number };

type Link = { to: string; purpose: EmailChangePurpose; token: string; expiresAt: Date };

/**
 * Charges the send budget (a cooldown per purpose and an hourly allowance
 * across the settings flows), then mails the link. Charged before delivery;
 * a failed delivery keeps the charge and reports itself, it never refunds or
 * retries on its own. Never called while the account lock is held.
 */
export async function deliverLink(ctx: AuthedCtx, link: Link): Promise<Delivery> {
  const cooldown = await acquireCooldown(
    settingsThrottleKeys.emailSendCooldown(ctx.user.id, link.purpose),
    EMAIL_CHANGE_POLICY.sendCooldownSeconds,
  );
  if (!cooldown.allowed) return { delivery: "rate-limited", retryAfterSeconds: cooldown.retryAfterSeconds };
  const { limit, windowSeconds } = EMAIL_CHANGE_POLICY.sends;
  const budget = await consumeBudget(settingsThrottleKeys.emailSends(ctx.user.id), limit, windowSeconds);
  if (!budget.allowed) return { delivery: "rate-limited", retryAfterSeconds: budget.retryAfterSeconds };

  try {
    await sendEmailChangeConfirmationEmail({
      to: link.to,
      url: await confirmationUrl(link.token),
      token: link.token,
      purpose: link.purpose,
      expiresAtLabel: formatUtcDateTime(link.expiresAt),
      name: ctx.user.name,
      recipient: { userId: ctx.user.id, name: ctx.user.name },
    });
    return { delivery: "sent" };
  } catch (error) {
    ctx.log.error(`email change link (${link.purpose}) could not be sent`, { error: errorMessage(error) });
    return { delivery: "failed" };
  }
}

/** When the purpose's cooldown lifts, as an instant for the owner's status view; `null` when it has. */
export async function resendAvailableAt(userId: string, purpose: EmailChangePurpose, now: Date): Promise<string | null> {
  try {
    const cooling = await isCoolingDown(settingsThrottleKeys.emailSendCooldown(userId, purpose));
    return cooling.allowed ? null : new Date(now.getTime() + cooling.retryAfterSeconds * 1000).toISOString();
  } catch {
    // A status detail only; the resend action itself fails closed.
    return null;
  }
}
