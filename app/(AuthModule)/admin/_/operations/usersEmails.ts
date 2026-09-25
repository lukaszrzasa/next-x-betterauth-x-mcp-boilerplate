import "server-only";

import { describeTargetedAudit } from "@/src/lib/auth/builders/actionAudit";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { sendPasswordReset, sendVerification } from "@/app/(AuthModule)/admin/_/db/users/emails";
import { userTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import type { UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";

/**
 * The two email actions. Neither needs step-up: a verification message
 * proves nothing by itself, and the public forgot-password flow already
 * exists; the buttons still require their own declared permissions and the
 * server-side throttle. Not MCP-eligible.
 */

// TODO(audit): the operation-level integration point for users.verification.requested
// and users.password_reset.requested refusals and failures; the accepted-send
// events are recorded at the write sites in db/users/emails.ts.
const auditLog = describeTargetedAudit<{ userId: string }, UserMutationOutcome>({
  target: (input) => input.userId,
  result: (output) => output.status,
});

export const sendVerificationOperation = defineAction({
  name: "users.sendVerification",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.send-verification"],
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => sendVerification(ctx, input),
  auditLog,
});

export const sendPasswordResetOperation = defineAction({
  name: "users.sendPasswordReset",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.send-password-reset"],
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => sendPasswordReset(ctx, input),
  auditLog,
});
