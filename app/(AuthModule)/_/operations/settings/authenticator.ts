import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { beginEnrollment } from "@/app/(AuthModule)/_/db/settings/twoFactor/beginEnrollment";
import { beginReplacement } from "@/app/(AuthModule)/_/db/settings/twoFactor/beginReplacement";
import { cancelSetup } from "@/app/(AuthModule)/_/db/settings/twoFactor/cancelSetup";
import { confirmEnrollment } from "@/app/(AuthModule)/_/db/settings/twoFactor/confirmEnrollment";
import { confirmReplacement } from "@/app/(AuthModule)/_/db/settings/twoFactor/confirmReplacement";
import { disableAuthenticator } from "@/app/(AuthModule)/_/db/settings/twoFactor/disableAuthenticator";
import { retryFactorSessionRefresh } from "@/app/(AuthModule)/_/db/settings/twoFactor/retryFactorSessionRefresh";
import {
  confirmSetupSchema,
  currentPasswordOnlySchema,
  setupTargetSchema,
} from "@/app/(AuthModule)/_/schemas/settings";

/**
 * Authenticator setup, replacement and disabling. Initial enrollment cannot
 * require a factor that does not exist yet (password only); replacement and
 * disabling require the existing factor's step-up (declared enrolled-only,
 * so an account without a factor gets the service's closed refusal or a
 * no-op instead of an email-code prompt); completion of a replacement
 * re-requires it when the grant has lapsed. Nothing here is MCP-eligible.
 */

const describe = (ctx: { user: { id: string } }, event: { outcome: string }) => `${ctx.user.id}: ${event.outcome}`;

export const beginEnrollmentOperation = defineAction({
  name: "settings.authenticator.beginEnrollment",
  schema: currentPasswordOnlySchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => beginEnrollment(ctx, input),
  auditLog: describe,
});

export const confirmEnrollmentOperation = defineAction({
  name: "settings.authenticator.confirmEnrollment",
  schema: confirmSetupSchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => confirmEnrollment(ctx, input),
  auditLog: describe,
});

export const beginReplacementOperation = defineAction({
  name: "settings.authenticator.beginReplacement",
  schema: currentPasswordOnlySchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: (ctx, input) => beginReplacement(ctx, input),
  auditLog: describe,
});

export const confirmReplacementOperation = defineAction({
  name: "settings.authenticator.confirmReplacement",
  schema: confirmSetupSchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: (ctx, input) => confirmReplacement(ctx, input),
  auditLog: describe,
});

/** Abandons the actor's own attempt; the active factor is never written. */
export const cancelSetupOperation = defineAction({
  name: "settings.authenticator.cancelSetup",
  schema: setupTargetSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => cancelSetup(ctx, input),
  auditLog: describe,
});

export const disableAuthenticatorOperation = defineAction({
  name: "settings.authenticator.disable",
  schema: currentPasswordOnlySchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: (ctx, input) => disableAuthenticator(ctx, input),
  auditLog: describe,
});

/** Refreshes committed provider user copies only; permitted after disabling, when no factor exists. */
export const retryFactorSessionRefreshOperation = defineAction({
  name: "settings.authenticator.retrySessionRefresh",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx) => retryFactorSessionRefresh(ctx),
  auditLog: describe,
});
