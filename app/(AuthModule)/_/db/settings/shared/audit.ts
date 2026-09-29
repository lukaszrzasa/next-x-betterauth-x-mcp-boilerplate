import "server-only";

import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";
import type { EmailChangeCancelReason } from "@/src/lib/db";
import { UNKNOWN_USER_LABEL, effectsOutcome, userEntity, userEntityById } from "@/app/(AuthModule)/_/db/auditEntities";
import { recordAuditEvent } from "@/app/(LogsModule)/_/db/auditLogService";
import type { AuditOutcome, ChangeItem, DetailItem, EntitySnapshot, MessageBlock } from "@/app/(LogsModule)/_/types";
import type { SettingsEffect } from "@/app/(AuthModule)/_/types/settings";

/**
 * The audit events of the account's own settings and of the public flows
 * that act on an account (email proofs, password reset), recorded by the
 * services once their effect is confirmed. Refusals and failures of the same
 * operations are recorded by the pipeline (see the `audit` of each
 * definition in `operations/`).
 *
 * The actor comes from the context: the signed-in owner, or Anonymous for a
 * public flow, where the subject is the account the token established -
 * never a session that happens to be open in the browser. Values are an
 * allowlist per event: never passwords, tokens or their digests, codes,
 * factor secrets or session tokens. Session and request IDs are opaque
 * identifiers, not credentials.
 */

export type SettingsEventName =
  | "settings.profile.name_updated"
  | "settings.session_sync.retried"
  | "settings.verification.requested"
  | "settings.session.revoked"
  | "settings.sessions.revoked"
  | "settings.sessions.others_revoked"
  | "settings.password.changed"
  | "settings.security_state.retired"
  | "settings.email_request.created"
  | "settings.email_request.link_sent"
  | "settings.email_request.destination_selected"
  | "settings.email_request.current_confirmed"
  | "settings.email_request.cancelled"
  | "settings.email_request.expired"
  | "settings.email.changed"
  | "settings.factor_setup.started"
  | "settings.factor_setup.cancelled"
  | "settings.factor_setup.expired"
  | "settings.factor.enrolled"
  | "settings.factor.replaced"
  | "settings.factor.disabled"
  | "settings.recovery_codes.regenerated"
  | "auth.password.reset"
  | "auth.setup.completed";

/**
 * The account an event is about: with its name when the caller has the row,
 * or by ID alone (a token-established account, a provider hook), when the
 * signed-in owner's name or a read of the account supplies the label.
 */
export type AccountRef = { id: string; name: string | null | undefined } | { id: string };

export type SettingsAuditEvent = {
  eventName: SettingsEventName;
  account: AccountRef;
  /** A complete sentence ("Changed their display name."). */
  summary: string;
  /** Defaults to `succeeded`, or follows `effects`. */
  outcome?: AuditOutcome;
  changes?: ChangeItem[];
  details?: DetailItem[];
  /** Tells apart several events of one name in one request (see `recordAuditEvent`). */
  discriminator?: string;
  /** Follow-up effects attempted and which failed; they decide the outcome (`effectsOutcome`). */
  effects?: { attempted: readonly SettingsEffect[]; failed: readonly SettingsEffect[]; committed: boolean };
};

const EFFECT_LABELS: Record<SettingsEffect, string> = {
  "session-refresh": "Session refresh",
  "session-renewal": "Session renewal",
  "session-revocation": "Sign-out of sessions",
};

export async function recordSettingsEvent(ctx: AuthedCtx | PublicCtx, event: SettingsAuditEvent): Promise<void> {
  const message: MessageBlock[] = [{ type: "text", value: event.summary }];
  if (event.changes?.length) message.push({ type: "changes", items: event.changes });
  const details = [...(event.details ?? []), ...effectDetails(event.effects)];
  if (details.length > 0) message.push({ type: "details", items: details });

  await recordAuditEvent(ctx, {
    eventName: event.eventName,
    outcome:
      event.outcome ??
      effectsOutcome(
        event.effects && {
          attempted: event.effects.attempted.length,
          failed: event.effects.failed.length,
          committed: event.effects.committed,
        },
      ),
    subject: await accountEntity(ctx, event.account),
    message,
    ...(event.discriminator === undefined ? {} : { discriminator: event.discriminator }),
  });
}

async function accountEntity(ctx: AuthedCtx | PublicCtx, account: AccountRef): Promise<EntitySnapshot> {
  if ("name" in account) return userEntity(account);
  if (ctx.user?.id === account.id) return userEntity(ctx.user);
  try {
    return await userEntityById(account.id);
  } catch {
    // A label is display data; the ID is the identity and is always kept.
    return { type: "user", id: account.id, label: UNKNOWN_USER_LABEL };
  }
}

function effectDetails(effects: SettingsAuditEvent["effects"]): DetailItem[] {
  if (!effects) return [];
  return effects.attempted.map((effect) => ({
    key: `effect.${effect}`,
    label: EFFECT_LABELS[effect],
    value: effects.failed.includes(effect) ? "Not confirmed" : "Completed",
  }));
}

// ---------------------------------------------------------------------------
// Lifecycle transitions of pending requests
// ---------------------------------------------------------------------------

/**
 * A pending email request leaving the active states. Returned by the
 * statements in `emailChange/requests.ts` (null when the row had already
 * moved on) and recorded by whoever owns the transaction, after it commits:
 * an event must never describe a transition that rolled back.
 */
export type EmailRequestTransition =
  | { requestId: string; to: "expired" }
  | { requestId: string; to: "cancelled"; reason: EmailChangeCancelReason };

const CANCEL_REASON_LABELS: Record<EmailChangeCancelReason, string> = {
  user: "Cancelled by the account owner",
  replaced: "Replaced by a newer request",
  credentials: "The password changed",
  admin_change: "An administrator changed the address",
  banned: "The account was banned",
  account_changed: "The account changed since the request",
};

export async function recordEmailRequestTransitions(
  ctx: AuthedCtx | PublicCtx,
  account: AccountRef,
  transitions: readonly (EmailRequestTransition | null)[],
): Promise<void> {
  for (const transition of transitions) {
    if (!transition) continue;
    const request: DetailItem = { key: "requestId", label: "Request", value: transition.requestId };
    await recordSettingsEvent(
      ctx,
      transition.to === "expired"
        ? {
            eventName: "settings.email_request.expired",
            account,
            summary: "A pending email change request expired.",
            details: [request],
            discriminator: transition.requestId,
          }
        : {
            eventName: "settings.email_request.cancelled",
            account,
            summary: "A pending email change request was cancelled.",
            details: [request, { key: "reason", label: "Reason", value: CANCEL_REASON_LABELS[transition.reason] }],
            discriminator: transition.requestId,
          },
    );
  }
}

/** A staged authenticator setup that was retired before it completed. */
export type CancelledSetup = { id: string; kind: "enroll" | "replace" };

export type SetupCancelReason = "user" | "replaced" | "credentials" | "admin_change" | "banned" | "email_changed" | "disabled";

const SETUP_CANCEL_REASON_LABELS: Record<SetupCancelReason, string> = {
  user: "Cancelled by the account owner",
  replaced: "Replaced by a newer setup",
  credentials: "The password changed",
  admin_change: "An administrator changed the address",
  banned: "The account was banned",
  email_changed: "The sign-in email changed",
  disabled: "The authenticator was being turned off",
};

export async function recordSetupCancellations(
  ctx: AuthedCtx | PublicCtx,
  account: AccountRef,
  setups: readonly CancelledSetup[],
  reason: SetupCancelReason,
): Promise<void> {
  for (const setup of setups) {
    await recordSettingsEvent(ctx, {
      eventName: "settings.factor_setup.cancelled",
      account,
      summary: setup.kind === "enroll" ? "A pending authenticator setup was cancelled." : "A pending authenticator replacement was cancelled.",
      details: [
        { key: "requestId", label: "Setup", value: setup.id },
        { key: "reason", label: "Reason", value: SETUP_CANCEL_REASON_LABELS[reason] },
      ],
      discriminator: setup.id,
    });
  }
}
