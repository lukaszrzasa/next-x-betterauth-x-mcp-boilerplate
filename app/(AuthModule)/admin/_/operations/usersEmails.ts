import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";
import { sendPasswordReset, sendVerification } from "@/app/(AuthModule)/admin/_/db/users/emails";
import { userTargetSchema } from "@/app/(AuthModule)/admin/_/schema";

/**
 * The two email actions. Neither needs step-up: a verification message
 * proves nothing by itself, and the public forgot-password flow already
 * exists; the buttons still require their own declared permissions and the
 * server-side throttle. Not MCP-eligible. Neither writes a staff log entry:
 * nothing on the account changes, and the message is in the email log.
 */

export const sendVerificationOperation = defineAction({
  name: "users.sendVerification",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.send-verification"],
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => sendVerification(ctx, input),
});

export const sendPasswordResetOperation = defineAction({
  name: "users.sendPasswordReset",
  schema: userTargetSchema,
  roles: STAFF_ROLES,
  permissions: ["user.get", "user.send-password-reset"],
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => sendPasswordReset(ctx, input),
});
