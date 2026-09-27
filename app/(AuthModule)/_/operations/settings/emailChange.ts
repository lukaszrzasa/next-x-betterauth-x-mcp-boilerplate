import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { beginEmailChange } from "@/app/(AuthModule)/_/db/settings/emailChange/beginEmailChange";
import { cancelEmailRequest } from "@/app/(AuthModule)/_/db/settings/emailChange/cancelEmailRequest";
import { resendEmailRequest } from "@/app/(AuthModule)/_/db/settings/emailChange/resendEmailRequest";
import { resendOwnVerification } from "@/app/(AuthModule)/_/db/settings/emailChange/resendOwnVerification";
import { selectNewEmailAddress } from "@/app/(AuthModule)/_/db/settings/emailChange/selectNewEmailAddress";
import {
  beginEmailChangeSchema,
  emailRequestTargetSchema,
  selectNewEmailSchema,
} from "@/app/(AuthModule)/_/schemas/settings";

/**
 * The verified-address change: initiation (password, enrolled-only step-up),
 * destination selection after the current mailbox agreed, resend and
 * cancel. The service re-reads ownership and stage on every step.
 */

const describe = (ctx: { user: { id: string } }, event: { outcome: string }) => `${ctx.user.id}: ${event.outcome}`;

export const beginEmailChangeOperation = defineAction({
  name: "settings.emailChange.begin",
  schema: beginEmailChangeSchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: (ctx, input) => beginEmailChange(ctx, input),
  auditLog: describe,
});

/** Authorization was recorded at initiation; within the request window no password is repeated. */
export const selectNewEmailOperation = defineAction({
  name: "settings.emailChange.selectNewAddress",
  schema: selectNewEmailSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => selectNewEmailAddress(ctx, input),
  auditLog: describe,
});

export const resendEmailRequestOperation = defineAction({
  name: "settings.emailRequest.resend",
  schema: emailRequestTargetSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => resendEmailRequest(ctx, input),
  auditLog: describe,
});

/** Withdrawing a pending change needs no proof: nothing is committed by it. */
export const cancelEmailRequestOperation = defineAction({
  name: "settings.emailRequest.cancel",
  schema: emailRequestTargetSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => cancelEmailRequest(ctx, input),
  auditLog: describe,
});

/** The ordinary verification email for the actor's own unverified address; no proof, throttled. */
export const resendVerificationOperation = defineAction({
  name: "settings.email.resendVerification",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx) => resendOwnVerification(ctx),
  auditLog: describe,
});
